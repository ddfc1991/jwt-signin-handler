# JWT收集技能 (JWT Collector Skill)

**用于APP注册后登陆签到的JWT自动收集方案**

## 技能概述

这是一个为移动Agent设计的JWT收集技能，专门用于处理APP注册后的登陆签到流程，支持手机环境的各种限制条件。

## 核心功能

### 1. 自动JWT提取
- 从登陆响应中自动识别和提取JWT
- 支持多种响应格式（JSON、嵌套字段等）
- 自动检测JWT位置（response body、headers、cookies）

### 2. 存储与管理
- 本地安全存储JWT Token
- 支持多个账户Token管理
- 自动过期检测和刷新

### 3. 请求签到
- 自动在后续请求中携带JWT
- 支持自定义Authorization头格式
- 支持Bearer Token标准格式

## 使用方法

### 方法签名
```javascript
async collectAndStoreJWT(response, options = {})
```

### 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `response` | Object | 登陆API的响应对象 |
| `options.tokenPath` | String | JWT在响应中的路径，如 `data.token` 或 `accessToken` |
| `options.storage` | String | 存储位置：`localStorage` \| `sessionStorage` \| `memory` (默认: localStorage) |
| `options.storageKey` | String | 存储的key名称 (默认: `app_jwt_token`) |
| `options.expiresIn` | Number | Token过期时间（秒），0表示不过期 |
| `options.useBearer` | Boolean | 是否使用Bearer前缀 (默认: true) |

### 快速开始示例

```javascript
// 1. 注册登陆
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, password })
});

const data = await loginResponse.json();

// 2. 使用技能收集JWT
const jwtSkill = new JWTCollectorSkill();
await jwtSkill.collectAndStoreJWT(data, {
  tokenPath: 'data.token',        // 根据实际API响应调整
  storage: 'localStorage',
  storageKey: 'my_app_jwt'
});

// 3. 自动签到
const signInResult = await jwtSkill.autoSignIn('/api/auth/signin');
console.log(signInResult); // { success: true, message: '签到成功' }
```

## API接口

### collectAndStoreJWT(response, options)
**功能**：从登陆响应提取并存储JWT

**返回值**：
```javascript
{
  success: boolean,
  token: string,
  expiresAt: number | null,
  message: string
}
```

**示例**：
```javascript
const result = await jwtSkill.collectAndStoreJWT(loginData, {
  tokenPath: 'token',
  storage: 'localStorage'
});
```

---

### getStoredJWT()
**功能**：获取存储的JWT

**返回值**：`string | null`

**示例**：
```javascript
const token = jwtSkill.getStoredJWT();
if (token) {
  console.log('已获取Token:', token);
}
```

---

### autoSignIn(signInUrl, options)
**功能**：自动进行签到请求

**参数**：
- `signInUrl`: 签到API端点
- `options.method`: HTTP方法 (默认: 'POST')
- `options.headers`: 自定义请求头

**返回值**：
```javascript
{
  success: boolean,
  data: object,
  message: string
}
```

**示例**：
```javascript
const signInResult = await jwtSkill.autoSignIn('/api/user/signin', {
  method: 'POST',
  headers: { 'X-Device-Id': 'device123' }
});
```

---

### isTokenValid()
**功能**：检查Token是否有效

**返回值**：`boolean`

**示例**：
```javascript
if (jwtSkill.isTokenValid()) {
  // Token仍然有效，可以使用
} else {
  // Token已过期，需要重新登陆
}
```

---

### clearJWT()
**功能**：清除存储的JWT

**返回值**：`boolean`

**示例**：
```javascript
jwtSkill.clearJWT();
```

---

### setAuthHeader(config)
**功能**：为请求配置自动添加JWT

**参数**：
- `config.headerName`: 请求头名称 (默认: 'Authorization')
- `config.prefix`: Token前缀 (默认: 'Bearer')

**示例**：
```javascript
// 配置axios自动添加JWT
jwtSkill.setAuthHeader({
  headerName: 'Authorization',
  prefix: 'Bearer'
});

// 之后的所有请求都会自动添加JWT
axios.get('/api/protected-route'); // 自动带上Authorization头
```

## 手机环境适配

### 支持的存储方式

| 存储方式 | 适用场景 | 优点 | 缺点 |
|---------|--------|------|------|
| `localStorage` | 需要持久化Token | 数据持久保存 | 受限于浏览器存储空间 |
| `sessionStorage` | 单次会话 | 会话结束自动清除 | 关闭App后丢失 |
| `memory` | 临时存储 | 最轻量级 | App重启后丢失 |

### 手机限制处理

#### 问题1：没有localStorage（某些限制浏览器）
```javascript
// 自动回退到sessionStorage或内存
const jwtSkill = new JWTCollectorSkill({
  autoFallback: true  // 自动降级存储方式
});
```

#### 问题2：Cookie限制（第三方Cookie被禁用）
```javascript
// 使用自定义请求头替代
jwtSkill.setAuthHeader({
  headerName: 'X-Auth-Token',  // 使用自定义头
  prefix: ''  // 不需要前缀
});
```

#### 问题3：跨域请求
```javascript
// 配置CORS兼容
const jwtSkill = new JWTCollectorSkill({
  corsMode: 'cors',
  credentials: 'include'  // 允许跨域时发送凭证
});
```

## 完整示例（针对手机APP）

```javascript
class MobileAppJWTFlow {
  async performLoginAndSignIn() {
    try {
      // 步骤1：用户注册后登陆
      const loginResp = await this.login({
        phone: userPhone,
        password: userPassword
      });

      // 步骤2：初始化JWT收集技能
      const jwtSkill = new JWTCollectorSkill({
        autoFallback: true,
        storage: 'localStorage'
      });

      // 步骤3：收集JWT
      const collectResult = await jwtSkill.collectAndStoreJWT(loginResp, {
        tokenPath: 'data.accessToken',
        expiresIn: 86400  // 24小时过期
      });

      if (!collectResult.success) {
        throw new Error('JWT收集失败: ' + collectResult.message);
      }

      // 步骤4：配置自动Authorization
      jwtSkill.setAuthHeader({
        headerName: 'Authorization',
        prefix: 'Bearer'
      });

      // 步骤5：执行签到
      const signInResult = await jwtSkill.autoSignIn('/api/user/signin');

      if (signInResult.success) {
        console.log('✅ 注册登陆签到成功');
        return {
          token: collectResult.token,
          userData: signInResult.data
        };
      }

    } catch (error) {
      console.error('❌ 流程失败:', error);
      throw error;
    }
  }

  async login(credentials) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    return response.json();
  }
}

// 使用
const mobileFlow = new MobileAppJWTFlow();
await mobileFlow.performLoginAndSignIn();
```

## 配置选项（完整）

```javascript
const jwtSkill = new JWTCollectorSkill({
  // 存储配置
  storage: 'localStorage',           // 存储方式
  storageKey: 'app_jwt_token',       // 存储键名
  autoFallback: true,                 // 存储方式不可用时自动降级
  
  // Token配置
  expiresIn: 0,                       // 过期时间（秒），0不过期
  refreshBuffer: 300,                 // 提前刷新的缓冲时间（秒）
  
  // 请求配置
  headerName: 'Authorization',        // 认证请求头名
  headerPrefix: 'Bearer',             // 请求头前缀
  
  // CORS配置
  corsMode: 'cors',                   // CORS模式
  credentials: 'include',             // 跨域凭证
  
  // 调试模式
  debug: false                        // 是否打印调试日志
});
```

## 常见问题

### Q: Token存储在哪里最安全？
**A:** 在手机APP环境中：
- **最安全**：Native存储（加密）
- **次优**：sessionStorage（会话结束清除）
- **临时**：内存存储（APP关闭丢失）

### Q: 如何处理Token过期？
**A:** 
```javascript
if (!jwtSkill.isTokenValid()) {
  // 自动刷新或重新登陆
  await jwtSkill.refreshToken(refreshTokenUrl);
}
```

### Q: 支持多账户吗？
**A:** 支持！使用不同的storageKey：
```javascript
const skill1 = new JWTCollectorSkill({ storageKey: 'user1_token' });
const skill2 = new JWTCollectorSkill({ storageKey: 'user2_token' });
```

## 相关文件

- 📄 [完整实现代码](./jwt-collector-skill.js)
- 📋 [API文档](./API.md)
- 🧪 [测试用例](./tests/)
- 📱 [移动端集成指南](./MOBILE_INTEGRATION.md)

---

**版本**: 1.0.0  
**更新时间**: 2026-08-30  
**适配环境**: 移动端浏览器、WebView、Electron
