# Qwen 模型支持

本项目现已支持 Qwen 模型，通过多个 API 提供商来访问 Qwen 大语言模型。

## 支持的提供商

### 1. OpenRouter
- **API Key 环境变量**: `OPENROUTER_API_KEY`
- **获取地址**: https://openrouter.ai/keys
- **支持的模型**: 
  - `qwen/qvq-72b-preview` (默认)
  - `qwen/qwen2.5-72b-instruct-turbo`
  - `qwen/qwen2.5-7b-instruct-turbo`

### 2. DeepInfra
- **API Key 环境变量**: `DEEPINFRA_API_KEY`
- **获取地址**: https://deepinfra.com/dash/api_keys
- **支持的模型**:
  - `Qwen/Qwen2.5-72B-Instruct-Turbo` (默认)
  - `Qwen/Qwen2-7B-Instruct`

### 3. AI/ML API
- **API Key 环境变量**: `AIML_API_KEY`
- **获取地址**: https://aimlapi.com
- **支持的模型**:
  - `qwen/qvq-72b-preview` (默认)
  - `qwen/qwen2.5-72b-instruct-turbo`

## 配置方式

### 环境变量设置
在您的 `.env` 文件或环境中设置相应的 API Key：

```bash
# 选择其中一个提供商
OPENROUTER_API_KEY=your_openrouter_api_key_here
# 或
DEEPINFRA_API_KEY=your_deepinfra_api_key_here  
# 或
AIML_API_KEY=your_aiml_api_key_here
```

### 启动应用
运行 Gemini CLI 后，在认证方法选择界面中，您将看到以下新选项：
- **Qwen via OpenRouter**
- **Qwen via DeepInfra** 
- **Qwen via AI/ML API**

选择对应的选项即可开始使用 Qwen 模型。

## 功能特性

- ✅ 支持聊天对话
- ✅ 支持流式响应
- ✅ 支持工具调用 (Function Calling)
- ✅ 支持多轮对话
- ✅ 基本的 token 计数估算
- ❌ 不支持 embedding 功能（需要单独实现）

## 模型选择

如果您想使用特定的 Qwen 模型，可以在配置中指定：

- **QVQ-72B**: 专为视觉推理设计的高级模型
- **Qwen2.5-72B-Instruct-Turbo**: 平衡性能和速度的大模型
- **Qwen2.5-7B-Instruct-Turbo**: 轻量级但高效的模型

## 注意事项

1. 不同提供商的模型名称格式可能不同
2. API 配额和定价请参考各提供商的官方文档
3. 某些高级功能（如 thinking mode）可能因提供商而异
4. Embedding 功能目前不被支持，如需要请联系开发团队

## 故障排除

如果遇到问题，请检查：
1. API Key 是否正确设置
2. 网络连接是否正常
3. API 配额是否充足
4. 模型名称是否正确