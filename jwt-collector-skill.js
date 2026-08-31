/**
 * JWT收集技能实现 - 移动端Agent版本
 * 专为APP注册后的登陆签到流程设计
 * 支持手机环境各种限制条件
 */

class JWTCollectorSkill {
  constructor(config = {}) {
    // 存储配置
    this.storage = config.storage || 'localStorage';
    this.storageKey = config.storageKey || 'app_jwt_token';
    this.autoFallback = config.autoFallback !== false;

    // Token配置
    this.expiresIn = config.expiresIn || 0;
    this.refreshBuffer = config.refreshBuffer ?? 300; // 5分钟缓冲
    this.tokenData = null;

    // 请求配置
    this.headerName = config.headerName || 'Authorization';
    this.headerPrefix = config.headerPrefix || 'Bearer';

    // CORS配置
    this.corsMode = config.corsMode || 'cors';
    this.credentials = config.credentials || 'include';

    // 调试模式
    this.debug = config.debug || false;

    // 内部状态
    this._currentStorage = this.storage;
    this._interceptors = [];
    this._isInitialized = false;

    this.log('🚀 JWT收集技能已初始化');
  }

  /**
   * 调试日志输出
   */
  log(message, data = null) {
    if (this.debug) {
      const timestamp = new Date().toLocaleTimeString();
      if (data) {
        console.log(`[${timestamp}] ${message}`, data);
      } else {
        console.log(`[${timestamp}] ${message}`);
      }
    }
  }

  /**
   * 获取实际可用的存储对象
   */
  getStorageObject() {
    try {
      if (this._currentStorage === 'localStorage' && typeof localStorage !== 'undefined') {
        localStorage.setItem('__test__', 'test');
        localStorage.removeItem('__test__');
        return localStorage;
      }
    } catch (e) {
      this.log('⚠️  localStorage不可用，尝试降级');
      if (this.autoFallback) {
        this._currentStorage = 'sessionStorage';
      }
    }

    try {
      if (this._currentStorage === 'sessionStorage' && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('__test__', 'test');
        sessionStorage.removeItem('__test__');
        return sessionStorage;
      }
    } catch (e) {
      this.log('⚠️  sessionStorage不可用，使用内存存储');
      if (this.autoFallback) {
        this._currentStorage = 'memory';
      }
    }

    return null;
  }

  /**
   * 从嵌套路径获取值
   * 例如: "data.token" 会从 obj.data.token 获取
   */
  getNestedValue(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * 从登陆响应中收集并存储JWT
   */
  async collectAndStoreJWT(response, options = {}) {
    try {
      this.log('📥 开始收集JWT', options);

      // 获取Token值
      let token;
      if (options.tokenPath) {
        token = this.getNestedValue(response, options.tokenPath);
      } else {
        // 尝试常见的Token字段
        token = response.token || 
                response.accessToken || 
                response.access_token || 
                response.data?.token || 
                response.data?.accessToken;
      }

      if (!token) {
        return {
          success: false,
          token: null,
          expiresAt: null,
          message: 'JWT未找到，请检查tokenPath配置'
        };
      }

      // 验证Token格式（基本JWT验证）
      if (!this.isValidJWT(token)) {
        this.log('⚠️  Token格式可能不正确');
      }

      // 计算过期时间
      const expiresIn = options.expiresIn || this.expiresIn;
      const expiresAt = expiresIn > 0 ? Date.now() + expiresIn * 1000 : null;

      // 存储Token和元数据
      this.tokenData = {
        token,
        expiresAt,
        collectedAt: Date.now(),
        storageKey: options.storageKey || this.storageKey
      };

      // 保存到存储
      const storage = options.storage || this._currentStorage;
      const storageKey = options.storageKey || this.storageKey;
      
      this.saveToStorage(storageKey, this.tokenData, storage);

      this.log('✅ JWT已成功收集并存储', { token: token.substring(0, 20) + '...' });

      return {
        success: true,
        token,
        expiresAt,
        message: '✅ JWT收集成功'
      };

    } catch (error) {
      this.log('❌ JWT收集失败', error.message);
      return {
        success: false,
        token: null,
        expiresAt: null,
        message: `JWT收集失败: ${error.message}`
      };
    }
  }

  /**
   * 基本的JWT格式验证
   */
  isValidJWT(token) {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3; // JWT有三部分
  }

  /**
   * 将数据保存到存储
   */
  saveToStorage(key, data, storageType = null) {
    const storage = storageType || this._currentStorage;

    if (storage === 'memory') {
      // 内存存储
      if (!window.__jwt_memory_store__) {
        window.__jwt_memory_store__ = {};
      }
      window.__jwt_memory_store__[key] = data;
      this.log('💾 Token已保存到内存');
      return;
    }

    try {
      const storageObj = this.getStorageObject();
      if (storageObj) {
        storageObj.setItem(key, JSON.stringify(data));
        this.log(`💾 Token已保存到${storage}`);
      }
    } catch (error) {
      this.log('❌ 存储失败', error.message);
    }
  }

  /**
   * 从存储读取数据
   */
  readFromStorage(key, storageType = null) {
    const storage = storageType || this._currentStorage;

    if (storage === 'memory') {
      if (window.__jwt_memory_store__) {
        return window.__jwt_memory_store__[key];
      }
      return null;
    }

    try {
      const storageObj = this.getStorageObject();
      if (storageObj) {
        const data = storageObj.getItem(key);
        return data ? JSON.parse(data) : null;
      }
    } catch (error) {
      this.log('❌ 读取存储失败', error.message);
    }
    return null;
  }

  /**
   * 获取存储的JWT
   */
  getStoredJWT(storageKey = null) {
    const key = storageKey || this.storageKey;
    
    if (this.tokenData) {
      return this.tokenData.token;
    }

    const data = this.readFromStorage(key);
    if (data && data.token) {
      this.tokenData = data;
      return data.token;
    }

    return null;
  }

  /**
   * 检查Token是否有效
   */
  isTokenValid(storageKey = null) {
    const token = this.getStoredJWT(storageKey);
    
    if (!token) {
      this.log('⏰ Token不存在');
      return false;
    }

    const data = this.tokenData || this.readFromStorage(storageKey || this.storageKey);
    
    if (!data) {
      return false;
    }

    if (data.expiresAt) {
      const now = Date.now();
      const expiresAt = data.expiresAt;
      const timeUntilExpiry = expiresAt - now;

      if (timeUntilExpiry <= 0) {
        this.log('⏰ Token已过期');
        return false;
      }

      if (timeUntilExpiry <= this.refreshBuffer * 1000) {
        this.log('⏰ Token即将过期（在缓冲时间内）');
        return false;
      }
    }

    this.log('✅ Token有效');
    return true;
  }

  /**
   * 清除存储的JWT
   */
  clearJWT(storageKey = null) {
    try {
      const key = storageKey || this.storageKey;
      const storage = this._currentStorage;

      if (storage === 'memory') {
        if (window.__jwt_memory_store__) {
          delete window.__jwt_memory_store__[key];
        }
      } else {
        const storageObj = this.getStorageObject();
        if (storageObj) {
          storageObj.removeItem(key);
        }
      }

      this.tokenData = null;
      this.log('🗑️  Token已清除');
      return true;
    } catch (error) {
      this.log('❌ Token清除失败', error.message);
      return false;
    }
  }

  /**
   * 配置请求的Authorization头
   */
  setAuthHeader(config = {}) {
    this.headerName = config.headerName || this.headerName;
    this.headerPrefix = config.prefix || this.headerPrefix;
    this.log('⚙️  Authorization头已配置', { headerName: this.headerName, prefix: this.headerPrefix });
  }

  /**
   * 获取Authorization头值
   */
  getAuthHeaderValue(token = null) {
    const jwt = token || this.getStoredJWT();
    if (!jwt) {
      return null;
    }

    return this.headerPrefix ? `${this.headerPrefix} ${jwt}` : jwt;
  }

  /**
   * 为请求添加JWT
   */
  addJWTToRequest(config) {
    const authValue = this.getAuthHeaderValue();
    if (authValue) {
      config.headers = config.headers || {};
      config.headers[this.headerName] = authValue;
    }
    return config;
  }

  /**
   * 自动签到
   */
  async autoSignIn(signInUrl, options = {}) {
    try {
      this.log('🔐 开始自动签到', { url: signInUrl });

      const token = this.getStoredJWT();
      if (!token) {
        return {
          success: false,
          data: null,
          message: '❌ 未找到JWT，无法签到'
        };
      }

      if (!this.isTokenValid()) {
        return {
          success: false,
          data: null,
          message: '❌ JWT已过期或无效'
        };
      }

      const method = options.method || 'POST';
      const headers = {
        'Content-Type': 'application/json',
        [this.headerName]: this.getAuthHeaderValue(),
        ...options.headers
      };

      const fetchConfig = {
        method,
        headers,
        mode: this.corsMode,
        credentials: this.credentials
      };

      if (method !== 'GET' && options.body) {
        fetchConfig.body = JSON.stringify(options.body);
      }

      this.log('📤 发送签到请求', { method, url: signInUrl });

      const response = await fetch(signInUrl, fetchConfig);

      if (!response.ok) {
        return {
          success: false,
          data: null,
          message: `❌ 签到请求失败 (${response.status})`
        };
      }

      const data = await response.json();

      this.log('✅ 签到成功', data);

      return {
        success: true,
        data,
        message: '✅ 签到成功'
      };

    } catch (error) {
      this.log('❌ 签到失败', error.message);
      return {
        success: false,
        data: null,
        message: `❌ 签到失败: ${error.message}`
      };
    }
  }

  /**
   * 刷新Token
   */
  async refreshToken(refreshUrl, options = {}) {
    try {
      this.log('🔄 开始刷新Token', { url: refreshUrl });

      const method = options.method || 'POST';
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };

      // 如果有旧Token，可以在刷新时使用
      const token = this.getStoredJWT();
      if (token && options.includeOldToken) {
        headers[this.headerName] = this.getAuthHeaderValue();
      }

      const fetchConfig = {
        method,
        headers,
        mode: this.corsMode,
        credentials: this.credentials
      };

      if (options.body) {
        fetchConfig.body = JSON.stringify(options.body);
      }

      const response = await fetch(refreshUrl, fetchConfig);

      if (!response.ok) {
        return {
          success: false,
          message: `❌ Token刷新失败 (${response.status})`
        };
      }

      const data = await response.json();

      // 使用新Token
      const collectResult = await this.collectAndStoreJWT(data, {
        tokenPath: options.tokenPath || 'token'
      });

      return {
        success: collectResult.success,
        message: collectResult.message
      };

    } catch (error) {
      this.log('❌ Token刷新失败', error.message);
      return {
        success: false,
        message: `❌ Token刷新失败: ${error.message}`
      };
    }
  }

  /**
   * 为Axios配置拦截器
   */
  setupAxiosInterceptor(axiosInstance) {
    try {
      // 请求拦截器
      axiosInstance.interceptors.request.use(
        (config) => {
          const authValue = this.getAuthHeaderValue();
          if (authValue) {
            config.headers[this.headerName] = authValue;
          }
          return config;
        },
        (error) => Promise.reject(error)
      );

      // 响应拦截器 - 处理Token过期
      axiosInstance.interceptors.response.use(
        (response) => response,
        async (error) => {
          const originalRequest = error.config;

          if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // 尝试刷新Token
            const refreshResult = await this.refreshToken(
              originalRequest.refreshUrl || '/api/auth/refresh'
            );

            if (refreshResult.success) {
              // 重试原始请求
              const authValue = this.getAuthHeaderValue();
              if (authValue) {
                originalRequest.headers[this.headerName] = authValue;
              }
              return axiosInstance(originalRequest);
            }
          }

          return Promise.reject(error);
        }
      );

      this.log('⚙️  Axios拦截器已配置');
      return true;

    } catch (error) {
      this.log('❌ Axios拦截器配置失败', error.message);
      return false;
    }
  }

  /**
   * 完整的登陆→签到流程
   */
  async loginAndSignIn(loginUrl, signInUrl, credentials, options = {}) {
    try {
      this.log('🚀 开始登陆→签到流程');

      // 步骤1: 登陆
      this.log('📝 步骤1: 发送登陆请求');
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        mode: this.corsMode,
        credentials: this.credentials
      });

      if (!loginResponse.ok) {
        return {
          success: false,
          message: `❌ 登陆失败 (${loginResponse.status})`
        };
      }

      const loginData = await loginResponse.json();

      // 步骤2: 收集JWT
      this.log('📝 步骤2: 收集JWT');
      const collectResult = await this.collectAndStoreJWT(loginData, {
        tokenPath: options.tokenPath || 'data.token',
        expiresIn: options.expiresIn
      });

      if (!collectResult.success) {
        return collectResult;
      }

      // 步骤3: 签到
      this.log('📝 步骤3: 执行签到');
      const signInResult = await this.autoSignIn(signInUrl, options.signInOptions || {});

      if (signInResult.success) {
        this.log('✅ 登陆→签到流程完成');
      }

      return {
        success: signInResult.success,
        token: collectResult.token,
        userData: signInResult.data,
        message: signInResult.message
      };

    } catch (error) {
      this.log('❌ 流程执行失败', error.message);
      return {
        success: false,
        message: `❌ 流程执行失败: ${error.message}`
      };
    }
  }

  /**
   * 获取Token信息（解析JWT payload）
   */
  getTokenInfo(token = null) {
    try {
      const jwt = token || this.getStoredJWT();
      if (!jwt) return null;

      const parts = jwt.split('.');
      if (parts.length !== 3) return null;

      // 解码payload
      const payload = parts[1];
      const decoded = JSON.parse(atob(payload));

      return {
        header: JSON.parse(atob(parts[0])),
        payload: decoded,
        signature: parts[2],
        expiresIn: decoded.exp ? (decoded.exp * 1000 - Date.now()) / 1000 : null
      };
    } catch (error) {
      this.log('❌ Token解析失败', error.message);
      return null;
    }
  }
}

// 导出为CommonJS和ES6
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JWTCollectorSkill;
}
