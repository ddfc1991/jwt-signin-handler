/**
 * JWT收集技能 - 测试用例
 * 包含完整的功能测试和集成测试
 */

// ============ 单元测试 ============

class JWTCollectorSkillTests {
  constructor() {
    this.testResults = [];
    this.passedTests = 0;
    this.failedTests = 0;
  }

  /**
   * 断言函数
   */
  assert(condition, testName, message = '') {
    if (condition) {
      this.passedTests++;
      console.log(`✅ PASS: ${testName}`);
    } else {
      this.failedTests++;
      console.error(`❌ FAIL: ${testName} - ${message}`);
    }
    this.testResults.push({
      name: testName,
      passed: condition,
      message
    });
  }

  /**
   * 测试1: JWT收集 - 基本功能
   */
  testCollectBasicJWT() {
    console.log('\n📋 测试1: JWT收集 - 基本功能');
    
    const skill = new JWTCollectorSkill({ storage: 'memory', debug: true });
    const mockResponse = {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    };

    const result = skill.collectAndStoreJWT(mockResponse);
    
    this.assert(result.success, '收集JWT - 基本响应', '应该成功收集JWT');
    this.assert(result.token === mockResponse.token, '收集JWT - Token值正确', 'Token值应该匹配');
    this.assert(skill.getStoredJWT() === mockResponse.token, '收集JWT - 存储正确', '存储的Token应该可取出');
  }

  /**
   * 测试2: JWT收集 - 嵌套路径
   */
  testCollectNestedJWT() {
    console.log('\n📋 测试2: JWT收集 - 嵌套路径');
    
    const skill = new JWTCollectorSkill({ storage: 'memory' });
    const mockResponse = {
      data: {
        accessToken: 'nested.token.here'
      }
    };

    const result = skill.collectAndStoreJWT(mockResponse, {
      tokenPath: 'data.accessToken'
    });

    this.assert(result.success, '嵌套路径 - 收集成功', '应该成功从嵌套路径收集JWT');
    this.assert(result.token === 'nested.token.here', '嵌套路径 - Token值正确', 'Token值应该从嵌套路径提取');
  }

  /**
   * 测试3: JWT验证 - 有效性检查
   */
  testTokenValidity() {
    console.log('\n📋 测试3: JWT验证 - 有效性检查');
    
    const skill = new JWTCollectorSkill({ storage: 'memory' });
    const mockResponse = {
      token: 'valid.jwt.token'
    };

    skill.collectAndStoreJWT(mockResponse);
    const isValid = skill.isTokenValid();

    this.assert(isValid, '有效性检查 - 新Token有效', '刚收集的Token应该有效');
    
    // 清除并检查
    skill.clearJWT();
    const isValid2 = skill.isTokenValid();
    this.assert(!isValid2, '有效性检查 - 清除后无效', '清除后的Token应该无效');
  }

  /**
   * 测试4: Token过期检查
   */
  testTokenExpiration() {
    console.log('\n📋 测试4: Token过期检查');
    
    const skill = new JWTCollectorSkill({ storage: 'memory' });
    const mockResponse = {
      token: 'expiring.token'
    };

    // 收集会在1秒后过期的Token
    skill.collectAndStoreJWT(mockResponse, {
      expiresIn: 1
    });

    const isValid1 = skill.isTokenValid();
    this.assert(isValid1, '过期检查 - 刚收集有效', 'Token刚收集应该有效');

    // 等待1.1秒后再检查
    return new Promise((resolve) => {
      setTimeout(() => {
        const isValid2 = skill.isTokenValid();
        this.assert(!isValid2, '过期检查 - 过期后无效', 'Token过期后应该无效');
        resolve();
      }, 1100);
    });
  }

  /**
   * 测试5: 存储切换 - 自动降级
   */
  testStorageFallback() {
    console.log('\n📋 测试5: 存储切换 - 自动降级');
    
    const skill = new JWTCollectorSkill({ 
      storage: 'localStorage', 
      autoFallback: true 
    });

    const mockResponse = {
      token: 'fallback.test.token'
    };

    const result = skill.collectAndStoreJWT(mockResponse);
    
    // 检查是否自动降级或使用了可用存储
    this.assert(result.success, '自动降级 - 收集成功', '即使localStorage不可用也应该成功');
    this.assert(skill.getStoredJWT() === mockResponse.token, '自动降级 - Token可取出', '无论降级到哪种存储都应该能取出Token');
  }

  /**
   * 测试6: Authorization头生成
   */
  testAuthHeaderGeneration() {
    console.log('\n📋 测试6: Authorization头生成');
    
    const skill = new JWTCollectorSkill({ storage: 'memory' });
    skill.setAuthHeader({
      headerName: 'Authorization',
      prefix: 'Bearer'
    });

    const mockResponse = {
      token: 'test.token.123'
    };

    skill.collectAndStoreJWT(mockResponse);

    const authValue = skill.getAuthHeaderValue();
    this.assert(
      authValue === 'Bearer test.token.123', 
      '请求头 - Bearer格式', 
      'Authorization头应该包含Bearer前缀'
    );
  }

  /**
   * 测试7: 请求配置
   */
  testRequestConfiguration() {
    console.log('\n📋 测试7: 请求配置');
    
    const skill = new JWTCollectorSkill({ storage: 'memory' });
    const mockResponse = {
      token: 'request.config.token'
    };

    skill.collectAndStoreJWT(mockResponse);

    const config = {
      headers: {}
    };

    skill.addJWTToRequest(config);

    this.assert(
      config.headers.Authorization !== undefined,
      '请求配置 - 头部添加成功',
      'Authorization头应该被添加到config中'
    );
  }

  /**
   * 测试8: 清除JWT
   */
  testClearJWT() {
    console.log('\n📋 测试8: 清除JWT');
    
    const skill = new JWTCollectorSkill({ storage: 'memory' });
    const mockResponse = {
      token: 'token.to.clear'
    };

    skill.collectAndStoreJWT(mockResponse);
    this.assert(skill.getStoredJWT() !== null, '清除 - 清除前存在', 'Token收集后应该存在');

    skill.clearJWT();
    this.assert(skill.getStoredJWT() === null, '清除 - 清除后为空', 'Token清除后应该为null');
  }

  /**
   * 测试9: Token信息解析
   */
  testTokenInfoParsing() {
    console.log('\n📋 测试9: Token信息解析');
    
    const skill = new JWTCollectorSkill({ storage: 'memory' });
    // 使用一个有效的JWT示例
    const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    
    const mockResponse = {
      token: validJWT
    };

    skill.collectAndStoreJWT(mockResponse);
    const tokenInfo = skill.getTokenInfo();

    this.assert(
      tokenInfo !== null,
      'Token解析 - 解析成功',
      'Token应该能成功解析'
    );
    this.assert(
      tokenInfo?.payload?.name === 'John Doe',
      'Token解析 - payload正确',
      'payload应该包含正确的数据'
    );
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🚀 开始运行JWT收集技能测试套件\n');
    console.log('=' .repeat(50));

    this.testCollectBasicJWT();
    await this.testCollectNestedJWT();
    this.testTokenValidity();
    await this.testTokenExpiration();
    this.testStorageFallback();
    this.testAuthHeaderGeneration();
    this.testRequestConfiguration();
    this.testClearJWT();
    this.testTokenInfoParsing();

    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 测试结果总结:`);
    console.log(`✅ 通过: ${this.passedTests}`);
    console.log(`❌ 失败: ${this.failedTests}`);
    console.log(`📈 成功率: ${((this.passedTests / (this.passedTests + this.failedTests)) * 100).toFixed(2)}%\n`);

    return {
      totalTests: this.passedTests + this.failedTests,
      passedTests: this.passedTests,
      failedTests: this.failedTests,
      successRate: (this.passedTests / (this.passedTests + this.failedTests)) * 100,
      details: this.testResults
    };
  }
}

// ============ 集成测试 ============

class JWTCollectorIntegrationTests {
  /**
   * 模拟登陆和签到流程
   */
  static async testLoginAndSignInFlow() {
    console.log('\n🔗 集成测试: 登陆→签到流程\n');

    const skill = new JWTCollectorSkill({
      storage: 'memory',
      debug: true,
      corsMode: 'cors'
    });

    // 模拟登陆响应
    const mockLoginResponse = {
      success: true,
      data: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwibmFtZSI6IkpvaG4gRG9lIn0.mock'
      }
    };

    console.log('📝 步骤1: 收集JWT');
    const collectResult = await skill.collectAndStoreJWT(mockLoginResponse, {
      tokenPath: 'data.token',
      expiresIn: 86400
    });

    if (!collectResult.success) {
      console.log('❌ 收集失败');
      return false;
    }

    console.log('✅ JWT已收集: ' + collectResult.token.substring(0, 20) + '...');

    console.log('\n📝 步骤2: 验证Token有效性');
    const isValid = skill.isTokenValid();
    console.log(isValid ? '✅ Token有效' : '❌ Token无效');

    console.log('\n📝 步骤3: 配置请求头');
    skill.setAuthHeader({
      headerName: 'Authorization',
      prefix: 'Bearer'
    });
    console.log('✅ 请求头已配置');

    console.log('\n📝 步骤4: 生成Authorization头');
    const authHeader = skill.getAuthHeaderValue();
    console.log('✅ Authorization: ' + authHeader.substring(0, 30) + '...');

    console.log('\n📝 步骤5: 添加JWT到请求配置');
    const requestConfig = { headers: {} };
    skill.addJWTToRequest(requestConfig);
    console.log('✅ 请求配置已更新:', requestConfig.headers);

    console.log('\n✅ 集成测试完成');
    return true;
  }

  /**
   * 测试多账户管理
   */
  static async testMultipleAccounts() {
    console.log('\n👥 集成测试: 多账户管理\n');

    const skill1 = new JWTCollectorSkill({
      storage: 'memory',
      storageKey: 'user1_token'
    });

    const skill2 = new JWTCollectorSkill({
      storage: 'memory',
      storageKey: 'user2_token'
    });

    console.log('📝 为用户1收集JWT');
    await skill1.collectAndStoreJWT({
      token: 'user1.jwt.token'
    });

    console.log('📝 为用户2收集JWT');
    await skill2.collectAndStoreJWT({
      token: 'user2.jwt.token'
    });

    const token1 = skill1.getStoredJWT();
    const token2 = skill2.getStoredJWT();

    console.log(`✅ 用户1 Token: ${token1}`);
    console.log(`✅ 用户2 Token: ${token2}`);

    const sameToken = token1 === token2;
    console.log(sameToken ? '❌ Token相同（错误）' : '✅ Token不同（正确）');

    return !sameToken;
  }

  /**
   * 模拟Token过期和刷新
   */
  static async testTokenRefresh() {
    console.log('\n🔄 集成测试: Token过期和刷新\n');

    const skill = new JWTCollectorSkill({
      storage: 'memory',
      debug: true
    });

    console.log('📝 收集一个短期Token（2秒后过期）');
    await skill.collectAndStoreJWT(
      { token: 'short.lived.token' },
      { expiresIn: 2 }
    );

    console.log('✅ Token已收集');
    console.log('🕐 等待2秒...');

    return new Promise((resolve) => {
      setTimeout(() => {
        const isValid = skill.isTokenValid();
        console.log(isValid ? '❌ Token仍然有效（错误）' : '✅ Token已过期（正确）');

        console.log('\n📝 收集新Token');
        skill.collectAndStoreJWT(
          { token: 'new.valid.token' },
          { expiresIn: 3600 }
        );

        const isNewValid = skill.isTokenValid();
        console.log(isNewValid ? '✅ 新Token有效' : '❌ 新Token无效');

        resolve(!isValid && isNewValid);
      }, 2100);
    });
  }

  /**
   * 运行所有集成测试
   */
  static async runAllIntegrationTests() {
    console.log('\n' + '='.repeat(50));
    console.log('🔗 开始运行集成测试套件');
    console.log('='.repeat(50));

    const test1 = await this.testLoginAndSignInFlow();
    const test2 = await this.testMultipleAccounts();
    const test3 = await this.testTokenRefresh();

    console.log('\n' + '='.repeat(50));
    console.log('📊 集成测试结果:');
    console.log(`${test1 ? '✅' : '❌'} 登陆→签到流程: ${test1 ? '通过' : '失败'}`);
    console.log(`${test2 ? '✅' : '❌'} 多账户管理: ${test2 ? '通过' : '失败'}`);
    console.log(`${test3 ? '✅' : '❌'} Token过期刷新: ${test3 ? '通过' : '失败'}`);
    console.log('='.repeat(50) + '\n');

    return test1 && test2 && test3;
  }
}

// ============ 运行测试 ============

async function runAllTests() {
  console.log('\n🎯 JWT收集技能完整测试\n');

  // 运行单元测试
  const unitTester = new JWTCollectorSkillTests();
  const unitResults = await unitTester.runAllTests();

  // 运行集成测试
  const integrationPassed = await JWTCollectorIntegrationTests.runAllIntegrationTests();

  // 输出最终结果
  console.log('\n🎉 最终测试报告:');
  console.log(`📊 单元测试成功率: ${unitResults.successRate.toFixed(2)}%`);
  console.log(`🔗 集成测试: ${integrationPassed ? '✅ 全部通过' : '❌ 部分失败'}`);
  console.log('\n✅ 测试完成！\n');

  return {
    unitTests: unitResults,
    integrationTests: integrationPassed
  };
}

// 如果在浏览器环境中，自动运行
if (typeof window !== 'undefined') {
  window.runAllTests = runAllTests;
  console.log('💡 在控制台执行 runAllTests() 来运行所有测试');
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    JWTCollectorSkillTests,
    JWTCollectorIntegrationTests,
    runAllTests
  };
}
