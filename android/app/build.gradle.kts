plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.wjairplane.polytrackrecorder"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "io.github.wjairplane.polytrackrecorder"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

// The repo's userscripts (../*.user.js) are bundled as assets/userscripts/ at build time, so the app always has the
// scripts of the commit it was built from.
abstract class CopyUserscripts : DefaultTask() {
    @get:InputFiles
    abstract val scripts: ConfigurableFileCollection

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val dir = outputDir.get().asFile.resolve("userscripts")
        dir.deleteRecursively()
        dir.mkdirs()
        scripts.forEach { it.copyTo(dir.resolve(it.name), overwrite = true) }
    }
}

val copyUserscripts = tasks.register<CopyUserscripts>("copyUserscripts") {
    scripts.from(fileTree(rootDir.parentFile) { include("*.user.js") })
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyUserscripts, CopyUserscripts::outputDir)
    }
}
