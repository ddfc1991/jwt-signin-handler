# android-demo/README.md
Android demo (WebView + native bridge) for calling Termux local service

Overview:
- The demo shows an Android activity that hosts a WebView (test-panel.html) and injects an AndroidBridge JS interface.
- AndroidBridge uses OkHttp to call the local Termux server (http://127.0.0.1:3000) with x-termux-token header.

Files:
- MainActivity.kt: sets up WebView and injects AndroidBridge
- AndroidBridge.kt: implements exec/kvSet/kvGet via OkHttp and calls back to JS

Security:
- Do NOT hardcode secret in production. Use secure storage or dynamic short-lived tokens.

Build:
- This is a snippet to integrate into your app. It's not a full gradle project. Use it as reference.
