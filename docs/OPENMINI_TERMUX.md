# OpenMini / Termux Adapter and Smart Routing

This branch adds a Platform Adapter, a local Termux server sample, and an Account Router (smart routing for multiple providers/accounts).

Files added:
- src/platform-adapter.js: adapter that prefers native bridge (Intent/native) and falls back to local HTTP
- src/account-router.js: lightweight router for providers/accounts with weighted/backoff selection and persistence helpers
- examples/termux-server.js: minimal Termux server (REST + WebSocket) with auth, KV storage, exec white-list, and health

What I will do next (on this branch):
- Integrate PlatformAdapter into jwt-collector-skill-optimized.js as optional injection point
- Add demo UI hooks to test-panel.html for Termux connect, KV, exec and router control
- Add README usage & security guidance

Quick start for Termux server (example):

1. On Termux install node: `pkg install nodejs`
2. Save `examples/termux-server.js` and run:

```bash
export TERMUX_API_SECRET="your-strong-secret"
node examples/termux-server.js &
```

3. From the app or browser (if allowed) call `http://127.0.0.1:3000/health` or use the PlatformAdapter in your client code to call `/kv`, `/exec` etc.

Security:
- The sample server ONLY listens on localhost and requires `x-termux-token` header with secret.
- Use strict command white-list; do not expose the service publicly without additional protections.

Smart routing (accounts) overview:
- The AccountRouter can track multiple providers and accounts per provider.
- Selection uses weighted random/round-robin with exponential backoff on failures.
- Persistence available via injected storage adapter (e.g. platformAdapter.kvSet/get)
