// src/platform-adapter.js
// PlatformAdapter: prefer nativeBridge (Android Intent/native), fallback to local HTTP, support WS
class PlatformAdapter {
  constructor(options = {}) {
    this.nativeBridge = options.nativeBridge || null; // expected to be injected by host app
    this.httpBase = options.httpBase || 'http://127.0.0.1:3000';
    this.secretHeader = options.secretHeader || 'x-termux-token';
    this.secret = options.secret || null; // optional
  }

  // Native bridge call: should return Promise resolving to { ok, data }
  async callNative(action, payload = {}) {
    if (this.nativeBridge && typeof this.nativeBridge.call === 'function') {
      return await this.nativeBridge.call(action, payload);
    }
    throw new Error('nativeBridge not available');
  }

  // HTTP fetch wrapper: respects timeout and returns parsed JSON or opaque marker
  async httpFetch(path, opts = {}) {
    const url = path.startsWith('http') ? path : (this.httpBase.replace(/\/$/, '') + '/' + path.replace(/^\//, ''));
    const headers = Object.assign({}, opts.headers || {});
    if (this.secret) headers[this.secretHeader] = this.secret;

    const controller = new AbortController();
    const timeout = opts.timeout || 30000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, Object.assign({}, opts, { headers, signal: controller.signal }));
      clearTimeout(timer);
      if (response.type === 'opaque') return { opaque: true, ok: response.ok };
      const text = await response.text();
      try { return { ok: response.ok, data: text ? JSON.parse(text) : null, status: response.status }; } catch(e) { return { ok: response.ok, data: text, status: response.status }; }
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // Try to run command: prefer native, else HTTP
  async exec(cmd, args = []) {
    // Try native bridge
    if (this.nativeBridge) {
      try {
        return await this.callNative('exec', { cmd, args });
      } catch (e) {
        // fallthrough to HTTP
      }
    }
    // HTTP fallback
    const res = await this.httpFetch('/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd, args }) });
    return res;
  }

  // kv storage
  async kvSet(key, value) {
    if (this.nativeBridge) {
      try { return await this.callNative('kvSet', { key, value }); } catch(e){}
    }
    return await this.httpFetch('/kv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
  }

  async kvGet(key) {
    if (this.nativeBridge) {
      try { return await this.callNative('kvGet', { key }); } catch(e){}
    }
    return await this.httpFetch(`/kv?key=${encodeURIComponent(key)}`, { method: 'GET' });
  }

  // WebSocket helper (returns ws instance and message handlers user can set)
  createWebSocket(path = '/ws', protocols = []) {
    const url = (() => {
      if (path.startsWith('ws')) return path;
      const base = this.httpBase.replace(/^http/, 'ws').replace(/\/$/, '');
      return base + (path.startsWith('/') ? path : '/' + path);
    })();

    const ws = new WebSocket(url, protocols);
    // attach optional auth via query param
    return ws;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = PlatformAdapter;
export default PlatformAdapter;
