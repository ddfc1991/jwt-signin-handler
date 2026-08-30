/**
 * JWT收集技能优化版 - 沙箱友好版本
 * 专门针对严格沙箱环境（如OpenMini等限制环境）优化
 * 支持无权限API调用、支持Worker线程、内置音频引擎支持
 */

class JWTCollectorSkillOptimized {
  constructor(config = {}) {
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
    this._isInitialized = false;
    this._db = null; // IndexedDB连接
    this._metrics = {
      requestCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0
    };

    // 初始化
    this.initialize();
  }

  /**
   * 初始化
   */
  async initialize() {
    try {
      // 检测存储方式
      this._storageType = await this.detectStorageType();
      this.log(`✅ 存储类型: ${this._storageType}`, 'info');

      // 初始化IndexedDB（如果可用）
      if (this.useIndexedDB && this._storageType !== 'indexeddb') {
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

  /**
   * 自动检测最佳存储方式
   */
  async detectStorageType() {
    // 优先级: IndexedDB > localStorage > sessionStorage > memory
    
    // 检测IndexedDB
    try {
      if (typeof indexedDB !== 'undefined') {
        const db = indexedDB.open('jwt_storage');
        db.onerror = () => {};
        return 'indexeddb';
      }
    } catch (e) {
      this.log('⚠️  IndexedDB不可用', 'debug');
    }

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

  /**
   * 初始化IndexedDB
   */
  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('jwt_storage', 1);

        request.onerror = () => {
          this.log('❌ IndexedDB打开失败', 'warn');
          reject(request.error);
        };

        request.onsuccess = () => {
          this._db = request.result;
          
          // 创建对象存储
          if (!this._db.objectStoreNames.contains('tokens')) {
            const objectStore = this._db.createObjectStore('tokens', { keyPath: 'key' });
            objectStore.createIndex('expireAt', 'expireAt', { unique: false });
          }

          this.log('✅ IndexedDB已初始化', 'debug');
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('tokens')) {
            const objectStore = db.createObjectStore('tokens', { keyPath: 'key' });
            objectStore.createIndex('expireAt', 'expireAt', { unique: false });
          }
        };
      } catch (error) {
        this.log(`❌ IndexedDB初始化失败: ${error.message}`, 'warn');
        reject(error);
      }
    });
  }

  /**
   * 初始化Web Worker
   */
  initWorker() {
    try {
      // 创建内联Worker（避免跨域问题）
      const workerCode = `
        self.onmessage = function(e) {
          const { action, payload } = e.data;
          
          if (action === 'parse-token') {
            try {
              const parts = payload.split('.');
              if (parts.length === 3) {
                const decoded = JSON.parse(atob(parts[1]));
                self.postMessage({ success: true, data: decoded });
              }
            } catch (error) {
              self.postMessage({ success: false, error: error.message });
            }
          }
          
          if (action === 'compress') {
            // 简单的压缩实现
            const compressed = btoa(JSON.stringify(payload));
            self.postMessage({ success: true, data: compressed });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this._worker = new Worker(workerUrl);
      
      this.log('✅ Web Worker已初始化', 'debug');
    } catch (error) {
      this.log(`⚠️  Worker初始化失败: ${error.message}`, 'warn');
      this._worker = null;
    }
  }

  /**
   * 初始化音频引擎
   */
  async initAudioEngine() {
    try {
      // 创建音频上下文
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        this.log('⚠️  浏览器不支持Web Audio API', 'warn');
        return;
      }

      this.audioEngine = {
        context: new AudioContext(),
        isPlaying: false,
        
        /**
         * 播放提示音
         */
        playTone: (frequency = 800, duration = 200) => {
          if (!this.audioEngine.isPlaying) {
            const osc = this.audioEngine.context.createOscillator();
            const gain = this.audioEngine.context.createGain();
            
            osc.connect(gain);
            gain.connect(this.audioEngine.context.destination);
            
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.3, this.audioEngine.context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioEngine.context.currentTime + duration / 1000);
            
            osc.start(this.audioEngine.context.currentTime);
            osc.stop(this.audioEngine.context.currentTime + duration / 1000);
            
            this.audioEngine.isPlaying = true;
            setTimeout(() => { this.audioEngine.isPlaying = false; }, duration);
          }
        },

        /**
         * 播放成功声音
         */
        playSuccess: () => {
          this.audioEngine.playTone(800, 100);
          setTimeout(() => this.audioEngine.playTone(1000, 100), 150);
        },

        /**
         * 播放错误声音
         */
        playError: () => {
          this.audioEngine.playTone(400, 200);
        }
      };

      this.log('✅ 音频引擎已初始化', 'debug');
    } catch (error) {
      this.log(`⚠️  音频引擎初始化失败: ${error.message}`, 'warn');
      this.audioEngine = null;
    }
  }

  /**
   * 日志输出
   */
  log(message, level = 'info') {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[this.logLevel] || 1;
    
    if (levels[level] >= currentLevel) {
      const timestamp = new Date().toLocaleTimeString();
      const prefix = `[${timestamp}]`;
      
      if (this.debug) {
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
          `${prefix} ${message}`
        );
      }
    }
  }

  /**
   * 保存到存储（支持多种方式）
   */
  async saveToStorage(key, data) {
    // 1. 内存缓存（总是保存）
    this.tokenCache.set(key, {
      data,
      timestamp: Date.now()
    });

    // 2. IndexedDB
    if (this._storageType === 'indexeddb' && this._db) {
      try {
        const transaction = this._db.transaction(['tokens'], 'readwrite');
        const objectStore = transaction.objectStore('tokens');
        objectStore.put({
          key,
          data,
          expireAt: data.expiresAt
        });
        this.log('💾 数据已保存到IndexedDB', 'debug');
        return;
      } catch (error) {
        this.log(`⚠️  IndexedDB保存失败: ${error.message}`, 'warn');
      }
    }

    // 3. localStorage/sessionStorage
    if (this._storageType === 'localStorage' || this._storageType === 'sessionStorage') {
      try {
        const storage = this._storageType === 'localStorage' ? localStorage : sessionStorage;
        storage.setItem(key, JSON.stringify(data));
        this.log(`💾 数据已保存到${this._storageType}`, 'debug');
        return;
      } catch (error) {
        this.log(`⚠️  ${this._storageType}保存失败: ${error.message}`, 'warn');
      }
    }

    this.log('💾 数据已保存到内存', 'debug');
  }

  /**
   * 从存储读取
   */
  async readFromStorage(key) {
    // 1. 先检查内存缓存
    if (this.tokenCache.has(key)) {
      this._metrics.cacheHits++;
      const cached = this.tokenCache.get(key);
      this.log('🎯 缓存命中', 'debug');
      return cached.data;
    }

    this._metrics.cacheMisses++;

    // 2. 检查IndexedDB
    if (this._storageType === 'indexeddb' && this._db) {
      try {
        return await new Promise((resolve) => {
          const transaction = this._db.transaction(['tokens'], 'readonly');
          const objectStore = transaction.objectStore('tokens');
          const request = objectStore.get(key);

          request.onsuccess = () => {
            if (request.result) {
              this.tokenCache.set(key, { data: request.result.data, timestamp: Date.now() });
              resolve(request.result.data);
            } else {
              resolve(null);
            }
          };

          request.onerror = () => resolve(null);
        });
      } catch (error) {
        this.log(`⚠️  IndexedDB读取失败: ${error.message}`, 'warn');
      }
    }

    // 3. 检查localStorage/sessionStorage
    if (this._storageType === 'localStorage' || this._storageType === 'sessionStorage') {
      try {
        const storage = this._storageType === 'localStorage' ? localStorage : sessionStorage;
        const data = storage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data);
          this.tokenCache.set(key, { data: parsed, timestamp: Date.now() });
          return parsed;
        }
      } catch (error) {
        this.log(`⚠️  ${this._storageType}读取失败: ${error.message}`, 'warn');
      }
    }

    return null;
  }

  /**
   * 收集JWT（优化版）
   */
  async collectAndStoreJWT(response, options = {}) {
    try {
      this.log('📥 开始收集JWT', 'info');

      // 获取Token
      let token = this.extractToken(response, options.tokenPath);

      if (!token) {
        return {
          success: false,
          token: null,
          expiresAt: null,
          message: 'JWT未找到'
        };
      }

      // 基本验证
      if (!this.isValidJWT(token)) {
        this.log('⚠️  Token格式可能不正确', 'warn');
      }

      // 计算过期时间
      const expiresIn = options.expiresIn || this.expiresIn;
      const expiresAt = expiresIn > 0 ? Date.now() + expiresIn * 1000 : null;

      this.tokenData = {
        token,
        expiresAt,
        collectedAt: Date.now(),
        storageKey: options.storageKey || this.storageKey
      };

      // 保存到存储
      await this.saveToStorage(options.storageKey || this.storageKey, this.tokenData);

      // 播放成功音
      if (this.audioEngine) {
        this.audioEngine.playSuccess();
      }

      this.log('✅ JWT收集成功', 'info');

      return {
        success: true,
        token,
        expiresAt,
        message: '✅ JWT收集成功'
      };

    } catch (error) {
      this.log(`❌ JWT收集失败: ${error.message}`, 'error');
      if (this.audioEngine) {
        this.audioEngine.playError();
      }
      return {
        success: false,
        token: null,
        expiresAt: null,
        message: `JWT收集失败: ${error.message}`
      };
    }
  }

  /**
   * 提取Token（支持多种格式）
   */
  extractToken(response, tokenPath) {
    if (tokenPath) {
      return this.getNestedValue(response, tokenPath);
    }

    // 尝试常见的Token字段
    return response.token || 
           response.accessToken || 
           response.access_token || 
           response.data?.token || 
           response.data?.accessToken ||
           response.Authorization ||
           response.authorization;
  }

  /**
   * 嵌套路径获取
   */
  getNestedValue(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * JWT格式验证
   */
  isValidJWT(token) {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3;
  }

  /**
   * 使用Worker解析Token（后台处理）
   */
  async parseTokenAsync(token = null) {
    const jwt = token || await this.getStoredJWT();
    if (!jwt || !this._worker) return null;

    return new Promise((resolve) => {
      this._worker.onmessage = (e) => {
        resolve(e.data.success ? e.data.data : null);
      };
      this._worker.postMessage({
        action: 'parse-token',
        payload: jwt
      });
    });
  }

  /**
   * 带超时的Fetch请求（沙箱友好）
   */
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        // 沙箱友好的CORS设置
        mode: 'no-cors',
        credentials: 'omit'
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * 批量请求处理（性能优化）
   */
  async queueRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ url, options, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * 处理请求队列
   */
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;

    this.isProcessingQueue = true;

    try {
      while (this.requestQueue.length > 0) {
        const { url, options, resolve, reject } = this.requestQueue.shift();
        
        try {
          const start = performance.now();
          const response = await this.fetchWithTimeout(url, options);
          const end = performance.now();

          // 更新性能指标
          this._metrics.requestCount++;
          this._metrics.avgResponseTime = (this._metrics.avgResponseTime + (end - start)) / 2;

          resolve(response);
        } catch (error) {
          reject(error);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * 自动签到（优化版）
   */
  async autoSignIn(signInUrl, options = {}) {
    try {
      this.log('🔐 开始自动签到', 'info');

      const token = await this.getStoredJWT();
      if (!token) {
        return {
          success: false,
          data: null,
          message: '❌ 未找到JWT'
        };
      }

      if (!this.isTokenValid()) {
        return {
          success: false,
          data: null,
          message: '❌ JWT已过期'
        };
      }

      const headers = {
        'Content-Type': 'application/json',
        [this.headerName]: `${this.headerPrefix} ${token}`,
        ...options.headers
      };

      // 使用批量请求（如果启用）
      const fetchFn = this.batchRequests ? this.queueRequest.bind(this) : this.fetchWithTimeout.bind(this);
      
      const response = await fetchFn(signInUrl, {
        method: options.method || 'POST',
        headers,
        body: JSON.stringify(options.body || {}),
        mode: this.corsMode,
        credentials: this.credentials
      });

      if (!response.ok) {
        throw new Error(`签到失败 (${response.status})`);
      }

      const data = await response.json();

      if (this.audioEngine) {
        this.audioEngine.playSuccess();
      }

      this.log('✅ 签到成功', 'info');

      return {
        success: true,
        data,
        message: '✅ 签到成功'
      };

    } catch (error) {
      this.log(`❌ 签到失败: ${error.message}`, 'error');
      if (this.audioEngine) {
        this.audioEngine.playError();
      }
      return {
        success: false,
        data: null,
        message: `❌ 签到失败: ${error.message}`
      };
    }
  }

  /**
   * 获取存储的JWT
   */
  async getStoredJWT(storageKey = null) {
    const key = storageKey || this.storageKey;
    
    if (this.tokenData?.token) {
      return this.tokenData.token;
    }

    const data = await this.readFromStorage(key);
    if (data?.token) {
      this.tokenData = data;
      return data.token;
    }

    return null;
  }

  /**
   * 检查Token有效性
   */
  isTokenValid(storageKey = null) {
    const token = this.tokenData?.token;
    if (!token) return false;

    if (this.tokenData?.expiresAt) {
      const now = Date.now();
      const timeUntilExpiry = this.tokenData.expiresAt - now;

      if (timeUntilExpiry <= 0) return false;
      if (timeUntilExpiry <= this.refreshBuffer * 1000) return false;
    }

    return true;
  }

  /**
   * 清除JWT
   */
  async clearJWT(storageKey = null) {
    const key = storageKey || this.storageKey;

    // 清除内存缓存
    this.tokenCache.delete(key);
    this.tokenData = null;

    // 清除IndexedDB
    if (this._storageType === 'indexeddb' && this._db) {
      try {
        const transaction = this._db.transaction(['tokens'], 'readwrite');
        const objectStore = transaction.objectStore('tokens');
        objectStore.delete(key);
      } catch (error) {
        this.log(`⚠️  IndexedDB清除失败: ${error.message}`, 'warn');
      }
    }

    // 清除localStorage/sessionStorage
    if (this._storageType === 'localStorage' || this._storageType === 'sessionStorage') {
      try {
        const storage = this._storageType === 'localStorage' ? localStorage : sessionStorage;
        storage.removeItem(key);
      } catch (error) {
        this.log(`⚠️  ${this._storageType}清除失败: ${error.message}`, 'warn');
      }
    }

    this.log('🗑️  Token已清除', 'info');
    return true;
  }

  /**
   * 获取性能指标
   */
  getMetrics() {
    return {
      ...this._metrics,
      cacheHitRate: this._metrics.cacheHits / (this._metrics.cacheHits + this._metrics.cacheMisses) || 0
    };
  }

  /**
   * 销毁资源
   */
  destroy() {
    if (this._worker) {
      this._worker.terminate();
    }
    if (this._db) {
      this._db.close();
    }
    this.tokenCache.clear();
    this.log('🛑 资源已释放', 'info');
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JWTCollectorSkillOptimized;
}
