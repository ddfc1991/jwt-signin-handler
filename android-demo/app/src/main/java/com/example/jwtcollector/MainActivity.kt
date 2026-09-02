package com.example.jwtcollector

import android.os.Bundle
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.allowFileAccess = true

        val secret = getSecretFromSecureSource()
        webView.addJavascriptInterface(AndroidBridge(this, webView, secret), "AndroidBridge")

        webView.loadUrl("file:///android_asset/test-panel.html")
    }

    private fun getSecretFromSecureSource(): String {
        // TODO: replace with secure retrieval (Android Keystore/Backend), this demo uses placeholder
        return "demo-secret-please-change"
    }
}
