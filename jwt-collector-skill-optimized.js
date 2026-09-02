/*
 * jwt-collector-skill-optimized.js
 * Integrated PlatformAdapter support, worker pending map, safer fetchWithTimeout and IndexedDB init fix
 */

// Try to load PlatformAdapter if present
let PlatformAdapter;
try { PlatformAdapter = require('./src/platform-adapter.js'); } catch(e) { PlatformAdapter = null; }

class JWTCollectorSkillOptimized {
  constructor(config = {}) {
    // platform adapter (injected or created)
    this.platformAdapter = config.platformAdapter || (PlatformAdapter ? new PlatformAdapter(config.platformAdapterOptions || {}) : null);

    // ============ 存储配置 ============
    this.storage = config.storage || 'auto'; // auto模式自动检测
    this.storageKey = config.storageKey || 'app_jwt_token';
    this.autoFallback = config.autoFallback !== false;
    this.useIndexedDB = config.useIndexedDB !== false; // 优先使用IndexedDB

    // ============ Token配置 ============
    this.expiresIn = config.expiresIn || 0;
    this.refreshBuffer = config.refreshBuffer || 300;
    this.tokenData = null;
    this.tokenCache = new Map(); // 内存缓存池

    // ============ 请求配置 ============
    this.headerName = config.headerName || 'Authorization';
    this.headerPrefix = config.headerPrefix || 'Bearer';
    this.requestTimeout = config.requestTimeout || 30000; // 30秒超时

    // ============ CORS配置 ============
    this.corsMode = config.corsMode || 'no-cors'; // 沙箱友好设置
    this.credentials = config.credentials || 'omit'; // 沙箱默认omit

    // ============ 性能优化 ============
    this.useWorker = config.useWorker !== false; // 使用Web Worker
    this.enableCompression = config.enableCompression !== false;
    this.batchRequests = config.batchRequests !== false;
    this.requestQueue = [];
    this.isProcessingQueue = false;

    // ============ 音频支持 ============
    this.audioEngine = null;
    this.enableAudio = config.enableAudio || false;

    // ============ 调试配置 ============
    this.debug = config.debug || false;
    this.logLevel = config.logLevel || 'info'; // 'debug', 'info', 'warn', 'error'

    // ============ 内部状态 ============
    this._currentStorage = this.storage;
    this._storageType = null; // 实际使用的存储类型
    this._worker = null;
    this._workerPending = new Map(); // pending map for worker requests
    this._isInitialized = false;
    this._db = null; // IndexedDB连接
    this._metrics = {
      requestCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0
    };

    // 初始化
    // don't await here to avoid blocking constructor; user can await initialize() if needed
    this.initialize();
  }

  async initialize() {
    try {
      // 检测存储方式
      this._storageType = await this.detectStorageType();
      this.log(`✅ 存储类型: ${this._storageType}`, 'info');

      // 如果环境支持IndexedDB并且user选择使用IndexedDB，初始化它
      if (this.useIndexedDB && this._storageType === 'indexeddb') {
        await this.initIndexedDB();
      }

      // 初始化Worker（如果需要）
      if (this.useWorker) {
        this.initWorker();
      }

      // 初始化音频引擎（如果需要）
      if (this.enableAudio) {
        await this.initAudioEngine();
      }

      this._isInitialized = true;
      this.log('🚀 JWT收集技能已初始化（优化版）', 'info');
    } catch (error) {
      this.log(`⚠️  初始化出错: ${error.message}`, 'warn');
    }
  }

  async detectStorageType() {
    // 优先级: IndexedDB > localStorage > sessionStorage > memory
    // try IndexedDB by attempting to open a short-lived DB
    try {
      if (typeof indexedDB !== 'undefined') {
        const ok = await new Promise((resolve) => {
          let timed = false;
          const timer = setTimeout(() => { timed = true; resolve(false); }, 2000);
          try {
            const req = indexedDB.open('jwt_storage_detect', 1);
            req.onerror = () => { if (!timed) { clearTimeout(timer); resolve(false); } };
            req.onsuccess = () => { if (!timed) { clearTimeout(timer); try { req.result.close(); } catch(e){} resolve(true); } };
            req.onupgradeneeded = () => { /* upgraded, still OK */ };
          } catch (e) { clearTimeout(timer); resolve(false); }
        });
        if (ok) return 'indexeddb';
      }
    } catch (e) { this.log('⚠️  IndexedDB检测异常', 'debug'); }

    // 检测localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('__test__', '1');
        localStorage.removeItem('__test__');
        return 'localStorage';
      }
    } catch (e) {
      this.log('⚠️  localStorage不可用', 'debug');
    }

    // 检测sessionStorage
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('__test__', '1');
        sessionStorage.removeItem('__test__');
        return 'sessionStorage';
      }
    } catch (e) {
      this.log('⚠️  sessionStorage不可用', 'debug');
    }

    // 降级到内存存储
    return 'memory';
  }

  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('jwt_storage', 1);

        request.onerror = (e) => {
          this.log('❌ IndexedDB打开失败', 'warn');
          reject(e.target ? e.target.error : e);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('tokens')) {
            const objectStore = db.createObjectStore('tokens', { keyPath: 'key' });
            objectStore.createIndex('expireAt', 'expireAt', { unique: false });
          }
        };

        request.onsuccess = (event) => {
          this._db = event.target.result;
          this.log('✅ IndexedDB已初始化', 'debug');
          resolve();
        };
      } catch (error) {
        this.log(`❌ IndexedDB初始化失败: ${error.message}`, 'warn');
        reject(error);
      }
    });
  }

  initWorker() {
    try {
      const workerCode = `
        self.onmessage = function(e) {
          const { id, action, payload } = e.data || {};
          if (!id) return;
          if (action === 'parse-token') {
            try {
              const parts = payload.split('.');
              if (parts.length === 3) {
                // safe base64 decode
                const b64 = parts[1].replace(/-/g,'+').replace(/_/g,'/');
                const decoded = JSON.parse(decodeURIComponent(escape(atob(b64))));
                self.postMessage({ id, success: true, data: decoded });
              } else {
                self.postMessage({ id, success: false, error: 'invalid jwt' });
              }
            } catch (error) {
              self.postMessage({ id, success: false, error: error.message });
            }
          }
          if (action === 'compress') {
            try {
              const compressed = btoa(JSON.stringify(payload));
              self.postMessage({ id, success: true, data: compressed });
            } catch(e) { self.postMessage({ id, success:false, error: e.message }); }
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this._worker = new Worker(workerUrl);

      // central message dispatcher
      this._worker.addEventListener('message', (e) => {
        const data = e.data || {};
        const { id, success, data: d, error } = data;
        if (id && this._workerPending.has(id)) {
          const { resolve, reject } = this._workerPending.get(id);
          this._workerPending.delete(id);
          if (success) resolve(d); else reject(new Error(error || 'worker error'));
        }
      });

      this.log('✅ Web Worker已初始化', 'debug');
    } catch (error) {
      this.log(`⚠️  Worker初始化失败: ${error.message}`, 'warn');
      this._worker = null;
    }
  }

  async initAudioEngine() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        this.log('⚠️  浏览器不支持Web Audio API', 'warn');
        return;
      }

      this.audioEngine = {
        context: new AudioContext(),
        isPlaying: false,
        playTone: (frequency = 800, duration = 200) => {
          if (!this.audioEngine.isPlaying) {
            const osc = this.audioEngine.context.createOscillator();
            const gain = this.audioEngine.context.createGain();
            osc.connect(gain); gain.connect(this.audioEngine.context.destination);
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.3, this.audioEngine.context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioEngine.context.currentTime + duration / 1000);
            osc.start(this.audioEngine.context.currentTime);
            osc.stop(this.audioEngine.context.currentTime + duration / 1000);
            this.audioEngine.isPlaying = true;
            setTimeout(() => { this.audioEngine.isPlaying = false; }, duration);
          }
        },
        playSuccess: () => { this.audioEngine.playTone(800,100); setTimeout(()=>this.audioEngine.playTone(1000,100),150); },
        playError: () => { this.audioEngine.playTone(400,200); }
      };

      this.log('✅ 音频引擎已初始化', 'debug');
    } catch (error) {
      this.log(`⚠️  音频引擎初始化失败: ${error.message}`, 'warn');
      this.audioEngine = null;
    }
  }

  log(message, level = 'info') {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[this.logLevel] || 1;
    if (levels[level] >= currentLevel) {
      const timestamp = new Date().toLocaleTimeString();
      if (this.debug) {
        if (level === 'error') console.error(`[${timestamp}] ${message}`); else if (level === 'warn') console.warn(`[${timestamp}] ${message}`); else console.log(`[${timestamp}] ${message}`);
      }
    }
  }

  async saveToStorage(key, data) {
    // always keep memory cache
    this.tokenCache.set(key, { data, timestamp: Date.now() });

    // platform adapter storage
    if (this.platformAdapter && this.platformAdapter.kvSet) {
      try { await this.platformAdapter.kvSet(key, data); this.log('💾 数据已保存到 platformAdapter','debug'); return; } catch(e) { this.log('⚠️ platformAdapter save failed','warn'); }
    }

    // IndexedDB
    if (this._storageType === 'indexeddb' && this._db) {
      try {
        const transaction = this._db.transaction(['tokens'], 'readwrite');
        const objectStore = transaction.objectStore('tokens');
        objectStore.put({ key, data, expireAt: data.expiresAt });
        this.log('💾 数据已保存到IndexedDB', 'debug');
        return;
      } catch (error) { this.log(`⚠️ IndexedDB保存失败: ${error.message}`, 'warn'); }
    }

    // local/session
    if (this._storageType === 'localStorage' || this._storageType === 'sessionStorage') {
      try {
        const storage = this._storageType === 'localStorage' ? localStorage : sessionStorage;
        storage.setItem(key, JSON.stringify(data));
        this.log(`💾 数据已保存到${this._storageType}`, 'debug');
        return;
      } catch (error) { this.log(`⚠️ ${this._storageType}保存失败: ${error.message}`, 'warn'); }
    }

    this.log('💾 数据已保存到内存', 'debug');
  }

  async readFromStorage(key) {
    // memory cache
    if (this.tokenCache.has(key)) {
      this._metrics.cacheHits++;
      this.log('🎯 缓存命中', 'debug');
      return this.tokenCache.get(key).data;
    }
    this._metrics.cacheMisses++;

    // platform adapter
    if (this.platformAdapter && this.platformAdapter.kvGet) {
      try {
        const res = await this.platformAdapter.kvGet(key);
        // adapter may return { ok, data } or data directly
        const data = res && res.data ? res.data : res;
        if (data) { this.tokenCache.set(key, { data, timestamp: Date.now() }); return data; }
      } catch(e) { this.log('⚠️ platformAdapter read failed','warn'); }
    }

    // indexeddb
    if (this._storageType === 'indexeddb' && this._db) {
      try {
        return await new Promise((resolve) => {
          const transaction = this._db.transaction(['tokens'], 'readonly');
          const objectStore = transaction.objectStore('tokens');
          const request = objectStore.get(key);
          request.onsuccess = () => { if (request.result) { this.tokenCache.set(key, { data: request.result.data, timestamp: Date.now() }); resolve(request.result.data); } else resolve(null); };
          request.onerror = () => resolve(null);
        });
      } catch (error) { this.log(`⚠️ IndexedDB读取失败: ${error.message}`, 'warn'); }
    }

    // local/session
    if (this._storageType === 'localStorage' || this._storageType === 'sessionStorage') {
      try {
        const storage = this._storageType === 'localStorage' ? localStorage : sessionStorage;
        const data = storage.getItem(key);
        if (data) { const parsed = JSON.parse(data); this.tokenCache.set(key, { data: parsed, timestamp: Date.now() }); return parsed; }
      } catch (error) { this.log(`⚠️ ${this._storageType}读取失败: ${error.message}`, 'warn'); }
    }

    return null;
  }

  async collectAndStoreJWT(response, options = {}) {
    try {
      this.log('📥 开始收集JWT', 'info');
      let token = this.extractToken(response, options.tokenPath);
      if (!token) return { success:false, token:null, expiresAt:null, message:'JWT未找到' };
      if (!this.isValidJWT(token)) this.log('⚠️ Token格式可能不正确','warn');

      const expiresIn = options.expiresIn || this.expiresIn;
      const expiresAt = expiresIn > 0 ? Date.now() + expiresIn * 1000 : null;
      this.tokenData = { token, expiresAt, collectedAt: Date.now(), storageKey: options.storageKey || this.storageKey };

      await this.saveToStorage(options.storageKey || this.storageKey, this.tokenData);
      if (this.audioEngine) this.audioEngine.playSuccess();
      this.log('✅ JWT收集成功','info');
      return { success:true, token, expiresAt, message:'✅ JWT收集成功' };
    } catch (error) {
      this.log(`❌ JWT收集失败: ${error.message}`,'error');
      if (this.audioEngine) this.audioEngine.playError();
      return { success:false, token:null, expiresAt:null, message:`JWT收集失败: ${error.message}` };
    }
  }

  extractToken(response, tokenPath) {
    if (tokenPath) return this.getNestedValue(response, tokenPath);
    return response && (response.token || response.accessToken || response.access_token || response.data?.token || response.data?.accessToken || response.Authorization || response.authorization) || null;
  }

  getNestedValue(obj, path) { if (!path) return obj; return path.split('.').reduce((current, prop) => current?.[prop], obj); }
  isValidJWT(token) { if (typeof token !== 'string') return false; const parts = token.split('.'); return parts.length === 3; }

  async parseTokenAsync(token = null) {
    const jwt = token || await this.getStoredJWT(); if (!jwt || !this._worker) return null;
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      this._workerPending.set(id, { resolve, reject });
      try { this._worker.postMessage({ id, action: 'parse-token', payload: jwt }); } catch(e) { this._workerPending.delete(id); return reject(e); }
      // timeout
      setTimeout(()=>{ if (this._workerPending.has(id)) { this._workerPending.delete(id); reject(new Error('worker timeout')); } }, 5000);
    });
  }

  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    const mode = options.mode || this.corsMode || 'cors';
    const credentials = options.credentials || this.credentials || 'include';

    try {
      const finalUrl = (this.platformAdapter && this.platformAdapter.httpBase && !url.startsWith('http')) ? (this.platformAdapter.httpBase.replace(/\/$/, '') + '/' + url.replace(/^\//,'') ) : url;

      const response = await fetch(finalUrl, Object.assign({}, options, { signal: controller.signal, mode, credentials }));
      clearTimeout(timeoutId);
      if (response.type === 'opaque') return { opaque:true, ok: response.ok, status: response.status || 0 };
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async queueRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ url, options, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;
    this.isProcessingQueue = true;
    try {
      while (this.requestQueue.length > 0) {
        const { url, options, resolve, reject } = this.requestQueue.shift();
        try {
          const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const response = await this.fetchWithTimeout(url, options);
          const end = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          this._metrics.requestCount++;
          this._metrics.avgResponseTime = (this._metrics.avgResponseTime + (end - start)) / 2;
          resolve(response);
        } catch (error) { reject(error); }
      }
    } finally { this.isProcessingQueue = false; }
  }

  async autoSignIn(signInUrl, options = {}) {
    try {
      this.log('🔐 开始自动签到','info');
      const token = await this.getStoredJWT(); if (!token) return { success:false, data:null, message:'❌ 未找到JWT' };
      if (!this.isTokenValid()) return { success:false, data:null, message:'❌ JWT已过期' };

      const headers = Object.assign({ 'Content-Type':'application/json', [this.headerName]: `${this.headerPrefix} ${token}` }, options.headers || {});
      const fetchFn = this.batchRequests ? this.queueRequest.bind(this) : this.fetchWithTimeout.bind(this);

      const response = await fetchFn(signInUrl, { method: options.method || 'POST', headers, body: JSON.stringify(options.body || {}), mode: this.corsMode, credentials: this.credentials });

      // support opaque response marker
      if (response && response.opaque) {
        // opaque: we cannot read body; infer success from ok flag
        if (response.ok) { if (this.audioEngine) this.audioEngine.playSuccess(); return { success:true, data:null, message:'✅ 签到请求已发送 (opaque)'}; }
        throw new Error(`签到失败 (opaque)`);
      }

      if (!response.ok) throw new Error(`签到失败 (${response.status})`);
      const data = await response.json();
      if (this.audioEngine) this.audioEngine.playSuccess();
      this.log('✅ 签到成功','info');
      return { success:true, data, message:'✅ 签到成功' };
    } catch (error) {
      this.log(`❌ 签到失败: ${error.message}`,'error'); if (this.audioEngine) this.audioEngine.playError(); return { success:false, data:null, message:`❌ 签到失败: ${error.message}` };
    }
  }

  async getStoredJWT(storageKey = null) {
    const key = storageKey || this.storageKey;
    if (this.tokenData?.token) return this.tokenData.token;
    // try platform adapter storage first (if implemented)
    if (this.platformAdapter && this.platformAdapter.kvGet) {
      try { const res = await this.platformAdapter.kvGet(key); const data = res && res.data ? res.data : res; if (data?.token) { this.tokenData = data; return data.token; } } catch(e) { this.log('⚠️ platformAdapter get failed','warn'); }
    }
    const data = await this.readFromStorage(key);
    if (data?.token) { this.tokenData = data; return data.token; }
    return null;
  }

  isTokenValid(storageKey = null) {
    const token = this.tokenData?.token; if (!token) return false;
    if (this.tokenData?.expiresAt) {
      const now = Date.now(); const timeUntilExpiry = this.tokenData.expiresAt - now;
      if (timeUntilExpiry <= 0) return false; if (timeUntilExpiry <= this.refreshBuffer * 1000) return false;
    }
    return true;
  }

  async clearJWT(storageKey = null) {
    const key = storageKey || this.storageKey;
    this.tokenCache.delete(key); this.tokenData = null;
    if (this.platformAdapter && this.platformAdapter.kvSet) {
      try { await this.platformAdapter.kvSet(key, null); } catch(e){}
    }
    if (this._storageType === 'indexeddb' && this._db) {
      try { const transaction = this._db.transaction(['tokens'], 'readwrite'); const objectStore = transaction.objectStore('tokens'); objectStore.delete(key); } catch(e){ this.log('⚠️ IndexedDB清除失败','warn'); }
    }
    if (this._storageType === 'localStorage' || this._storageType === 'sessionStorage') {
      try { const storage = this._storageType === 'localStorage' ? localStorage : sessionStorage; storage.removeItem(key); } catch(e){ this.log(`⚠️ ${this._storageType}清除失败`,'warn'); }
    }
    this.log('🗑️  Token已清除','info'); return true;
  }

  getMetrics() { return { ...this._metrics, cacheHitRate: this._metrics.cacheHits / (this._metrics.cacheHits + this._metrics.cacheMisses) || 0 }; }

  destroy() { if (this._worker) this._worker.terminate(); if (this._db) try { this._db.close(); } catch(e){} this.tokenCache.clear(); this.log('🛑 资源已释放','info'); }
}

if (typeof module !== 'undefined' && module.exports) module.exports = JWTCollectorSkillOptimized;
