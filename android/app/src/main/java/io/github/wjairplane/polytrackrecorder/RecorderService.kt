package io.github.wjairplane.polytrackrecorder

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Holds the screen-capture session while auto-record is on. One virtual display mirrors the screen for the whole
 * session (Android 14 allows only one per consent); each run gets its own MediaRecorder, swapped in as the display's
 * surface: [arm] starts a clip, [save] keeps it in Movies/PolyTrack, [cancel] deletes it.
 */
class RecorderService : Service() {

    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var recorder: MediaRecorder? = null
    private var pfd: ParcelFileDescriptor? = null
    private var uri: Uri? = null
    private var width = 0
    private var height = 0
    private var dpi = 0
    private val main = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(1, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        val data = intent?.getParcelableExtra(EXTRA_DATA, Intent::class.java)
        val code = intent?.getIntExtra(EXTRA_CODE, Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
        if (data == null || projection != null) return START_NOT_STICKY
        width = intent.getIntExtra(EXTRA_W, 1280)
        height = intent.getIntExtra(EXTRA_H, 720)
        dpi = intent.getIntExtra(EXTRA_DPI, 320)
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val p = mpm.getMediaProjection(code, data) ?: run { stopSelf(); return START_NOT_STICKY }
        p.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                if (projection != null) shutdown()
            }
        }, main)
        projection = p
        display = p.createVirtualDisplay(
            "PolyTrackRecorder", width, height, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, null, null, null
        )
        instance = this
        listener?.invoke()
        return START_NOT_STICKY
    }

    /** Starts a new clip (drops any clip still open). */
    fun arm() {
        dropClip()
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, "PolyTrack_run_" + stamp() + ".mp4")
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/PolyTrack")
            put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        val u = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values) ?: return
        try {
            val fd = contentResolver.openFileDescriptor(u, "w") ?: throw IllegalStateException("no file")
            val r = MediaRecorder(this).apply {
                setVideoSource(MediaRecorder.VideoSource.SURFACE)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                setVideoSize(width, height)
                setVideoFrameRate(60)
                setVideoEncodingBitRate(12_000_000)
                setOutputFile(fd.fileDescriptor)
                prepare()
            }
            display?.surface = r.surface
            r.start()
            recorder = r; pfd = fd; uri = u
            listener?.invoke()
        } catch (e: Exception) {
            Log.w(TAG, "could not start recording", e)
            contentResolver.delete(u, null, null)
        }
    }

    /** Finishes the open clip and keeps it, named after the run's time. Returns the file name, or null. */
    fun save(timeMs: Long): String? {
        val u = uri ?: return null
        val ok = stopRecorder()
        if (!ok) { contentResolver.delete(u, null, null); return null }
        val name = "PolyTrack_" + "%d-%02d.%03d".format(timeMs / 60000, timeMs / 1000 % 60, timeMs % 1000) + "_" + stamp() + ".mp4"
        contentResolver.update(u, ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, name)
            put(MediaStore.Video.Media.IS_PENDING, 0)
        }, null, null)
        listener?.invoke()
        return name
    }

    /** Throws the open clip away (restarted or abandoned run). */
    fun cancel() {
        dropClip()
        listener?.invoke()
    }

    val recording get() = recorder != null

    private fun dropClip() {
        val u = uri ?: return
        stopRecorder()
        contentResolver.delete(u, null, null)
    }

    private fun stopRecorder(): Boolean {
        val r = recorder ?: return false
        var ok = true
        try { r.stop() } catch (e: RuntimeException) { ok = false }   // stop() throws when nothing was recorded
        r.release()
        display?.surface = null
        try { pfd?.close() } catch (_: Exception) {}
        recorder = null; pfd = null; uri = null
        return ok
    }

    private fun shutdown() {
        dropClip()
        display?.release(); display = null
        val p = projection; projection = null; p?.stop()
        if (instance === this) instance = null
        listener?.invoke()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        if (projection != null) shutdown()
        super.onDestroy()
    }

    private fun stamp() = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Recording", NotificationManager.IMPORTANCE_LOW))
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("PolyTrack Recorder")
            .setContentText("Auto-record is on: finished runs are saved to Movies/PolyTrack")
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "PolyRec"
        private const val CHANNEL = "rec"
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        const val EXTRA_W = "w"
        const val EXTRA_H = "h"
        const val EXTRA_DPI = "dpi"

        /** The running session, or null when auto-record is off. */
        var instance: RecorderService? = null
            private set

        /** Called on the main thread whenever the session or recording state changes. */
        var listener: (() -> Unit)? = null

        fun stop(context: Context) {
            instance?.shutdown() ?: context.stopService(Intent(context, RecorderService::class.java))
        }
    }
}
