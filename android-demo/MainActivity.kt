// android-demo/MainActivity.kt
// Kotlin snippet showing how to inject AndroidBridge into WebView

/*
class MainActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val webView = WebView(this)
    setContentView(webView)
    webView.settings.javaScriptEnabled = true
    val secret = "${'$'}{getSecretFromSecureSource()}"
    webView.addJavascriptInterface(AndroidBridge(this, webView, secret), "AndroidBridge")
    webView.loadUrl("file:///android_asset/test-panel.html")
  }
}
*/
