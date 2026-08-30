# JWT收集技能 - 完整集成指南

为APP注册后的登陆签到流程设计的JWT自动收集解决方案

## 📋 目录

- [快速开始](#快速开始)
- [安装](#安装)
- [基础使用](#基础使用)
- [手机环境适配](#手机环境适配)
- [集成示例](#集成示例)
- [测试](#测试)
- [常见问题](#常见问题)
- [API文档](#api文档)

## 🚀 快速开始

### 最简单的用法 - 3行代码

```javascript
const skill = new JWTCollectorSkill({ storage: 'localStorage' });
await skill.collectAndStoreJWT(loginResponse, { tokenPath: 'data.token' });
await skill.autoSignIn('/api/user/signin');
```

## 📦 安装

### 方式1: 直接引入HTML

```html
<!-- 加载核心技能 -->
<script src="jwt-collector-skill.js"></script>

<!-- 可选：加载测试套件 -->
<script src="jwt-collector-skill.test.js"></script>
```

### 方式2: 模块化导入

```javascript
// Node.js/CommonJS
const JWTCollectorSkill = require('./jwt-collector-skill.js');

// ES6 模块
import JWTCollectorSkill from './jwt-collector-skill.js';
```

### 方式3: npm安装（如果发布到npm）

```bash
npm install jwt-collector-skill
```

## 💡 基础使用

### 完整示例：注册→登陆→签到

```javascript
async function registerAndSignIn() {
  // 初始化技能
  const jwtSkill = new JWTCollectorSkill({
    storage: 'localStorage',
    storageKey: 'app_jwt_token',
    expiresIn: 86400,  // 24小时过期
    debug: true        // 启用调试日志
  });

  try {
    // 步骤1: 用户注册
    const registerResp = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '13800138000',
        password: 'password123',
        name: 'John Doe'
      })
    });

    // 步骤2: 用户登陆
    const loginResp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '13800138000',
        password: 'password123'
      })
    });

    const loginData = await loginResp.json();

    // 步骤3: 收集JWT
    const collectResult = await jwtSkill.collectAndStoreJWT(loginData, {
      tokenPath: 'data.token',  // 根据API返回调整
      expiresIn: 86400
    });

    if (!collectResult.success) {
      throw new Error(collectResult.message);
    }

    console.log('✅ JWT收集成功:', collectResult.token.substring(0, 20) + '...');

    // 步骤4: 配置请求头
    jwtSkill.setAuthHeader({
      headerName: 'Authorization',
      prefix: 'Bearer'
    });

    // 步骤5: 执行签到
    const signInResult = await jwtSkill.autoSignIn('/api/user/signin');

    if (signInResult.success) {
      console.log('✅ 签到成功！');
      console.log('用户数据:', signInResult.data);
      return signInResult.data;
    } else {
      throw new Error(signInResult.message);
    }

  } catch (error) {
    console.error('❌ 流程失败:', error);
    throw error;
  }
}

// 执行
registerAndSignIn();
```

## 📱 手机环境适配

### 问题1: localStorage不可用

**症状**: 某些手机浏览器或WebView禁用了localStorage

**解决方案**:
```javascript
const jwtSkill = new JWTCollectorSkill({
  storage: 'localStorage',
  autoFallback: true  // ✅ 自动降级到sessionStorage或内存
});
```

**降级优先级**:
1. localStorage（最优，数据持久化）
2. sessionStorage（中等，会话结束清除）
3. 内存存储（最轻，重启后丢失）

### 问题2: Cookie限制

**症状**: 第三方Cookie被禁用，跨域请求无法携带凭证

**解决方案**:
```javascript
// 使用自定义请求头替代Cookie
jwtSkill.setAuthHeader({
  headerName: 'X-Auth-Token',  // 自定义请求头
  prefix: ''                    // 不需要Bearer前缀
});
```

### 问题3: CORS跨域问题

**症状**: 跨域请求被浏览器阻止

**解决方案**:
```javascript
const jwtSkill = new JWTCollectorSkill({
  corsMode: 'cors',              // ✅ 启用CORS
  credentials: 'include'         // ✅ 允许跨域凭证
});
```

### 问题4: 存储空间限制

**症状**: 某些手机存储空间有严格限制

**解决方案**:
```javascript
// 使用内存存储（最轻量）
const jwtSkill = new JWTCollectorSkill({
  storage: 'memory'  // ⚡ 零存储空间消耗
});
```

## 🔧 集成示例

### 与Axios集成

```javascript
import axios from 'axios';

const jwtSkill = new JWTCollectorSkill({ storage: 'localStorage' });

// 配置Axios拦截器
jwtSkill.setupAxiosInterceptor(axios);

// 之后所有请求都会自动携带JWT
axios.get('/api/protected-route')
  .then(response => console.log(response.data))
  .catch(error => console.error(error));
```

### 与Fetch集成

```javascript
const jwtSkill = new JWTCollectorSkill({ storage: 'localStorage' });

// 手动添加JWT到请求
const config = {
  method: 'GET',
  headers: {}
};

jwtSkill.addJWTToRequest(config);

fetch('/api/protected-route', config)
  .then(res => res.json())
  .then(data => console.log(data));
```

### 与React集成

```javascript
import { useEffect, useState } from 'react';

function LoginComponent() {
  const [jwtSkill] = useState(() => 
    new JWTCollectorSkill({ storage: 'localStorage' })
  );

  const handleLogin = async (credentials) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      // 收集JWT
      const result = await jwtSkill.collectAndStoreJWT(data, {
        tokenPath: 'data.token'
      });

      if (result.success) {
        // 签到
        await jwtSkill.autoSignIn('/api/user/signin');
        console.log('✅ 登陆成功！');
      }
    } catch (error) {
      console.error('❌ 登陆失败:', error);
    }
  };

  return (
    <button onClick={() => handleLogin({ phone: '...', password: '...' })}>
      登陆
    </button>
  );
}
```

### 与Vue集成

```javascript
// main.js
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);

// 创建全局JWT技能实例
const jwtSkill = new JWTCollectorSkill({ storage: 'localStorage' });

// 注入到全局属性
app.config.globalProperties.$jwtSkill = jwtSkill;

app.mount('#app');
```

```vue
<!-- 组件中使用 -->
<template>
  <button @click="login">登陆</button>
</template>

<script>
export default {
  methods: {
    async login() {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: this.phone,
          password: this.password
        })
      });

      const data = await response.json();

      // 使用全局JWT技能
      const result = await this.$jwtSkill.collectAndStoreJWT(data, {
        tokenPath: 'data.token'
      });

      if (result.success) {
        await this.$jwtSkill.autoSignIn('/api/user/signin');
        console.log('✅ 登陆成功！');
      }
    }
  }
}
</script>
```

## 🧪 测试

### 运行单元测试

```javascript
// 方式1: 在浏览器控制台
const tester = new JWTCollectorSkillTests();
await tester.runAllTests();

// 方式2: 在Node.js环境
const { JWTCollectorSkillTests } = require('./jwt-collector-skill.test.js');
const tester = new JWTCollectorSkillTests();
await tester.runAllTests();
```

### 使用测试面板

1. 在浏览器中打开 `test-panel.html`
2. 选择测试类型（单元测试/集成测试/手动测试）
3. 点击"运行测试"
4. 查看实时结果和日志

### 手动测试流程

```javascript
// 测试完整的登陆→签到流程
const skill = new JWTCollectorSkill();

const result = await skill.loginAndSignIn(
  '/api/auth/login',        // 登陆URL
  '/api/user/signin',       // 签到URL
  {                         // 登陆凭证
    phone: '13800138000',
    password: 'password'
  },
  {                         // 选项
    tokenPath: 'data.token'
  }
);

console.log(result.success ? '✅ 成功' : '❌ 失败');
```

## ❓ 常见问题

### Q: JWT存储在哪里最安全？
**A**: 优先级排序：
1. **最安全**: Native App的加密存储（调用Native API）
2. **次优**: sessionStorage（会话结束自动清除）
3. **可接受**: localStorage（需防XSS攻击）
4. **临时**: 内存存储（重启丢失）

### Q: 如何处理Token过期？
**A**:
```javascript
// 自动检查过期
if (!jwtSkill.isTokenValid()) {
  // Token已过期，需要刷新或重新登陆
  const result = await jwtSkill.refreshToken('/api/auth/refresh');
  if (!result.success) {
    // 重新登陆
    await login();
  }
}
```

### Q: 支持多账户吗？
**A**: 支持！使用不同的storageKey：
```javascript
const account1 = new JWTCollectorSkill({ 
  storageKey: 'account1_token' 
});
const account2 = new JWTCollectorSkill({ 
  storageKey: 'account2_token' 
});
```

### Q: 如何调试？
**A**: 启用debug模式：
```javascript
const jwtSkill = new JWTCollectorSkill({
  debug: true  // 打印详细日志
});
```

### Q: 可以在Node.js中使用吗？
**A**: 可以，但需要mock localStorage：
```javascript
global.localStorage = {
  data: {},
  setItem(key, value) { this.data[key] = value; },
  getItem(key) { return this.data[key]; },
  removeItem(key) { delete this.data[key]; }
};

const skill = new JWTCollectorSkill();
```

## 📚 API文档

### 构造函数

```javascript
new JWTCollectorSkill(config)
```

**config 参数**:
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `storage` | String | localStorage | 存储方式: localStorage/sessionStorage/memory |
| `storageKey` | String | app_jwt_token | 存储的key |
| `autoFallback` | Boolean | true | 存储不可用时自动降级 |
| `expiresIn` | Number | 0 | Token过期时间（秒） |
| `headerName` | String | Authorization | 请求头名称 |
| `headerPrefix` | String | Bearer | 请求头前缀 |
| `corsMode` | String | cors | CORS模式 |
| `credentials` | String | include | 跨域凭证 |
| `debug` | Boolean | false | 是否打印调试日志 |

### 核心方法

#### `collectAndStoreJWT(response, options)`
收集并存储JWT

**返回**: `{ success, token, expiresAt, message }`

#### `getStoredJWT(storageKey)`
获取存储的JWT

**返回**: `string | null`

#### `isTokenValid(storageKey)`
检查Token是否有效

**返回**: `boolean`

#### `autoSignIn(signInUrl, options)`
自动签到

**返回**: `{ success, data, message }`

#### `clearJWT(storageKey)`
清除存储的JWT

**返回**: `boolean`

#### `getTokenInfo(token)`
解析JWT并获取信息

**返回**: `{ header, payload, signature, expiresIn }`

#### `setAuthHeader(config)`
配置Authorization请求头

#### `addJWTToRequest(config)`
为请求配置添加JWT

#### `refreshToken(refreshUrl, options)`
刷新Token

**返回**: `{ success, message }`

#### `setupAxiosInterceptor(axiosInstance)`
为Axios配置自动JWT注入

**返回**: `boolean`

#### `loginAndSignIn(loginUrl, signInUrl, credentials, options)`
完整登陆→签到流程

**返回**: `{ success, token, userData, message }`

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和PR！

## 📞 技术支持

- 📖 查看完整文档：[jwt-collector-skill.md](./jwt-collector-skill.md)
- 🧪 运行测试：打开 [test-panel.html](./test-panel.html)
- 💬 提交问题：[GitHub Issues](https://github.com/ddfc1991/jwt-signin-handler/issues)
