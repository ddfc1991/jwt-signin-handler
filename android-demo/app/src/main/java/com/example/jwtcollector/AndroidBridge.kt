package com.example.jwtcollector

import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class AndroidBridge(
    private val ctx: Context,
    private val webView: WebView,
    private val secret: String
) {
    private val client = OkHttpClient.Builder()
        .callTimeout(15, TimeUnit.SECONDS)
        .build()

    // exec(cmd, argsJson, callbackId)
    @JavascriptInterface
    fun exec(cmd: String, argsJson: String?, callbackId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            val jsonBody = JSONObject()
            jsonBody.put("cmd", cmd)
            try { jsonBody.put("args", JSONArray(argsJson ?: "[]")) } catch(e) { jsonBody.put("args", JSONArray()) }

            val body = RequestBody.create("application/json; charset=utf-8".toMediaTypeOrNull(), jsonBody.toString())
            val req = Request.Builder()
                .url("http://127.0.0.1:3000/exec")
                .post(body)
                .addHeader("x-termux-token", secret)
                .build()

            try {
                val resp = client.newCall(req).execute()
                val respBody = resp.body?.string() ?: ""
                val resultJson = JSONObject().apply {
                    put("ok", resp.isSuccessful)
                    put("status", resp.code)
                    put("body", if (respBody.isNotEmpty()) try { JSONObject(respBody) } catch(e:Exception) { respBody } else JSONObject.NULL)
                }

                val script = "window.__nativeBridgeCallback && window.__nativeBridgeCallback(${JSONObject.quote(callbackId)}, ${JSONObject.quote(resultJson.toString())});"
                CoroutineScope(Dispatchers.Main).launch { webView.evaluateJavascript(script, null) }
            } catch (e: Exception) {
                val err = JSONObject().apply { put("ok", false); put("error", e.message) }
                val script = "window.__nativeBridgeCallback && window.__nativeBridgeCallback(${JSONObject.quote(callbackId)}, ${JSONObject.quote(err.toString())});"
                CoroutineScope(Dispatchers.Main).launch { webView.evaluateJavascript(script, null) }
            }
        }
    }

    @JavascriptInterface
    fun kvSet(key: String, valueJson: String, callbackId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            val jsonBody = JSONObject(); jsonBody.put("key", key); jsonBody.put("value", JSONObject(valueJson))
            val body = RequestBody.create("application/json; charset=utf-8".toMediaTypeOrNull(), jsonBody.toString())
            val req = Request.Builder().url("http://127.0.0.1:3000/kv").post(body).addHeader("x-termux-token", secret).build()
            try {
                val resp = client.newCall(req).execute(); val respBody = resp.body?.string() ?: ""
                val resultJson = JSONObject().apply { put("ok", resp.isSuccessful); put("status", resp.code); put("body", respBody) }
                val script = "window.__nativeBridgeCallback && window.__nativeBridgeCallback(${JSONObject.quote(callbackId)}, ${JSONObject.quote(resultJson.toString())});"
                CoroutineScope(Dispatchers.Main).launch { webView.evaluateJavascript(script, null) }
            } catch (e:Exception) {
                val err = JSONObject().apply { put("ok", false); put("error", e.message) }
                val script = "window.__nativeBridgeCallback && window.__nativeBridgeCallback(${JSONObject.quote(callbackId)}, ${JSONObject.quote(err.toString())});"
                CoroutineScope(Dispatchers.Main).launch { webView.evaluateJavascript(script, null) }
            }
        }
    }

    @JavascriptInterface
    fun kvGet(key: String, callbackId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            val req = Request.Builder().url("http://127.0.0.1:3000/kv?key=${"" + java.net.URLEncoder.encode(key, "utf-8")} ").get().addHeader("x-termux-token", secret).build()
            try {
                val resp = client.newCall(req).execute(); val respBody = resp.body?.string() ?: ""
                val resultJson = JSONObject().apply { put("ok", resp.isSuccessful); put("status", resp.code); put("body", respBody) }
                val script = "window.__nativeBridgeCallback && window.__nativeBridgeCallback(${JSONObject.quote(callbackId)}, ${JSONObject.quote(resultJson.toString())});"
                CoroutineScope(Dispatchers.Main).launch { webView.evaluateJavascript(script, null) }
            } catch(e:Exception) {
                val err = JSONObject().apply { put("ok", false); put("error", e.message) }
                val script = "window.__nativeBridgeCallback && window.__nativeBridgeCallback(${JSONObject.quote(callbackId)}, ${JSONObject.quote(err.toString())});"
                CoroutineScope(Dispatchers.Main).launch { webView.evaluateJavascript(script, null) }
            }
        }
    }
}
