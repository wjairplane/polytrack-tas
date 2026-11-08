package io.github.wjairplane.polytrackrecorder

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * PolyTrack in a full-screen WebView with one of the repo's userscripts injected at document start (like a userscript
 * manager), plus auto-record: while it's on, every finished run is saved as a video in Movies/PolyTrack.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var recButton: Button
    private lateinit var scriptButton: Button
    private lateinit var status: TextView
    private lateinit var pad: View
    private var handler: ScriptHandler? = null
    private val prefs by lazy { getSharedPreferences("app", MODE_PRIVATE) }

    private val scripts: List<Pair<String, String>> by lazy {        // (file, name from its @name line)
        (assets.list("userscripts") ?: emptyArray()).sorted().map { f ->
            val head = assets.open("userscripts/$f").bufferedReader().use { r -> generateSequence { r.readLine() }.take(10).toList() }
            f to (head.firstNotNullOfOrNull { Regex("@name\\s+(.+)").find(it)?.groupValues?.get(1)?.trim() } ?: f)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(true)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                    if (handler == null) view.evaluateJavascript(injected(), null)   // fallback: later than document start
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(m: ConsoleMessage) = true.also { android.util.Log.d("PolyRec", m.message()) }
            }
            addJavascriptInterface(Bridge(), "PolyRec")
        }

        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        // a column at the middle of the right edge: the userscript menu takes the top right, the game uses the corners
        val bar = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.END; setPadding(8, 8, 8, 8) }
        scriptButton = smallButton("Script") { pickScript() }
        recButton = smallButton("Rec: off") { toggleRecording() }
        val keysButton = smallButton("Keys") { pad.visibility = if (pad.visibility == View.VISIBLE) View.GONE else View.VISIBLE; prefs.edit().putBoolean("keys", pad.visibility == View.VISIBLE).apply() }
        status = TextView(this).apply { setTextColor(Color.WHITE); textSize = 12f; setPadding(12, 0, 12, 0); setShadowLayer(3f, 0f, 0f, Color.BLACK) }
        listOf(scriptButton, recButton, keysButton, status).forEach { bar.addView(it) }
        root.addView(bar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER_VERTICAL or Gravity.END))

        pad = keyPad()
        pad.visibility = if (prefs.getBoolean("keys", false)) View.VISIBLE else View.GONE
        root.addView(pad, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.END).apply { setMargins(0, 0, 24, (72 * resources.displayMetrics.density).toInt()) })

        setContentView(root)
        hideSystemBars()
        RecorderService.listener = { runOnUiThread { refresh() } }
        installScript()
        web.loadUrl(GAME)
        refresh()
    }

    override fun onDestroy() {
        RecorderService.listener = null
        web.destroy()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else AlertDialog.Builder(this).setMessage("Leave PolyTrack Recorder?")
            .setPositiveButton("Leave") { _, _ -> RecorderService.stop(this); finish() }.setNegativeButton("Stay", null).show()
    }

    // ---- userscript ----

    private val selected get() = prefs.getString("script", "all-tracks.user.js")?.takeIf { s -> scripts.any { it.first == s } || s.isEmpty() } ?: ""

    private fun injected(): String {
        val bridge = assets.open("bridge.js").bufferedReader().use { it.readText() }
        val script = selected.takeIf { it.isNotEmpty() }?.let { f -> assets.open("userscripts/$f").bufferedReader().use { it.readText() } } ?: ""
        return "$script\n;$bridge"
    }

    private fun installScript() {
        handler?.remove(); handler = null
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
            handler = WebViewCompat.addDocumentStartJavaScript(web, injected(), setOf(ORIGIN))
        else toast("This WebView can't run scripts at page start; update Android System WebView")
    }

    private fun pickScript() {
        val names = listOf("No script") + scripts.map { it.second }
        val files = listOf("") + scripts.map { it.first }
        AlertDialog.Builder(this).setTitle("Userscript")
            .setSingleChoiceItems(names.toTypedArray(), files.indexOf(selected)) { d, i ->
                prefs.edit().putString("script", files[i]).apply()
                d.dismiss(); installScript(); web.reload(); refresh()
            }.show()
    }

    // ---- recording ----

    private fun toggleRecording() {
        if (RecorderService.instance != null) { RecorderService.stop(this); refresh(); return }
        val mpm = getSystemService(MediaProjectionManager::class.java)
        @Suppress("DEPRECATION")
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_CAPTURE) return
        if (resultCode != RESULT_OK || data == null) { toast("Recording not allowed"); return }
        val m = resources.displayMetrics
        val bounds = windowManager.currentWindowMetrics.bounds
        var w = maxOf(bounds.width(), bounds.height()); var h = minOf(bounds.width(), bounds.height())
        if (w > 1920) { h = h * 1920 / w; w = 1920 }                  // keep the encoder within 1080p
        startForegroundService(Intent(this, RecorderService::class.java)
            .putExtra(RecorderService.EXTRA_CODE, resultCode).putExtra(RecorderService.EXTRA_DATA, data)
            .putExtra(RecorderService.EXTRA_W, w and 1.inv()).putExtra(RecorderService.EXTRA_H, h and 1.inv())
            .putExtra(RecorderService.EXTRA_DPI, m.densityDpi))
        toast("Auto-record on: each finished run is saved to Movies/PolyTrack")
    }

    private fun refresh() {
        val s = RecorderService.instance
        recButton.text = when { s == null -> "Rec: off"; s.recording -> "● Rec"; else -> "Rec: auto" }
        recButton.setTextColor(if (s?.recording == true) Color.rgb(255, 107, 87) else Color.WHITE)
        scriptButton.text = scripts.firstOrNull { it.first == selected }?.second?.replace(Regex("^PolyTrack\\s*|\\s*\\(frame-exact.*\\)"), "")?.take(28) ?: "No script"
    }

    /** Called by bridge.js from the page. */
    inner class Bridge {
        @JavascriptInterface fun arm() = runOnUiThread { RecorderService.instance?.arm() }
        @JavascriptInterface fun cancel() = runOnUiThread { RecorderService.instance?.cancel() }
        @JavascriptInterface fun save(timeMs: Long) = runOnUiThread {
            RecorderService.instance?.save(timeMs)?.let { status.text = "saved $it"; toast("Saved Movies/PolyTrack/$it") }
        }
    }

    // ---- on-screen keys (the game takes key events; TAS scripts need one W to start) ----

    @SuppressLint("ClickableViewAccessibility")
    private fun keyPad(): View {
        val grid = GridLayout(this).apply { columnCount = 4; rowCount = 2 }
        fun key(label: String, code: String, keyCode: Int, col: Int, row: Int) {
            val b = TextView(this).apply {
                text = label; textSize = 20f; gravity = Gravity.CENTER; setTextColor(Color.WHITE)
                background = GradientDrawable().apply { cornerRadius = 18f; setColor(Color.argb(140, 20, 24, 60)); setStroke(3, Color.argb(180, 255, 255, 255)) }
                setOnTouchListener { v, e ->
                    when (e.actionMasked) {
                        MotionEvent.ACTION_DOWN -> { sendKey("keydown", label.lowercase(), code, keyCode); v.alpha = 0.6f }
                        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { sendKey("keyup", label.lowercase(), code, keyCode); v.alpha = 1f }
                    }
                    true
                }
            }
            val size = (64 * resources.displayMetrics.density).toInt()
            grid.addView(b, GridLayout.LayoutParams(GridLayout.spec(row), GridLayout.spec(col)).apply { width = size; height = size; setMargins(6, 6, 6, 6) })
        }
        key("W", "KeyW", 87, 1, 0); key("T", "KeyT", 84, 3, 0)
        key("A", "KeyA", 65, 0, 1); key("S", "KeyS", 83, 1, 1); key("D", "KeyD", 68, 2, 1)
        return grid
    }

    private fun sendKey(type: String, key: String, code: String, keyCode: Int) {
        web.evaluateJavascript("document.body&&document.body.dispatchEvent(new KeyboardEvent('$type',{key:'$key',code:'$code',keyCode:$keyCode,which:$keyCode,bubbles:true}))", null)
    }

    // ---- helpers ----

    private fun smallButton(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label; isAllCaps = false; textSize = 12f; setTextColor(Color.WHITE); minHeight = 0; minimumHeight = 0
        setPadding(24, 8, 24, 8)
        background = GradientDrawable().apply { cornerRadius = 16f; setColor(Color.argb(200, 20, 24, 60)) }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(0, 6, 0, 6) }
        setOnClickListener { onClick() }
    }

    private fun hideSystemBars() {
        window.insetsController?.let {
            it.hide(WindowInsets.Type.systemBars())
            it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    companion object {
        private const val ORIGIN = "https://app-polytrack.kodub.com"
        private const val GAME = "$ORIGIN/0.6.3/"
        private const val REQ_CAPTURE = 1
    }
}
