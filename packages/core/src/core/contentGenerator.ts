/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { env } from 'node:process';
import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_QWEN_MODEL } from '../config/models.js';
import { getEffectiveModel } from './modelCheck.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  USE_QWEN_OPENROUTER = 'qwen-openrouter',
  USE_QWEN_DEEPINFRA = 'qwen-deepinfra',
  USE_QWEN_AIML = 'qwen-aiml',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  baseUrl?: string;
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: { getModel?: () => string },
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = env.GEMINI_API_KEY;
  const googleApiKey = env.GOOGLE_API_KEY;
  const googleCloudProject = env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = env.GOOGLE_CLOUD_LOCATION;
  
  // Qwen API keys for different providers
  const qwenOpenRouterKey = env.OPENROUTER_API_KEY;
  const qwenDeepInfraKey = env.DEEPINFRA_API_KEY;
  const qwenAimlKey = env.AIML_API_KEY;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // if we are using google auth nothing else to validate for now
  if (authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return contentGeneratorConfig;
  }

  // Qwen OpenRouter configuration
  if (authType === AuthType.USE_QWEN_OPENROUTER && qwenOpenRouterKey) {
    contentGeneratorConfig.apiKey = qwenOpenRouterKey;
    contentGeneratorConfig.baseUrl = 'https://openrouter.ai/api/v1';
    contentGeneratorConfig.model = effectiveModel.startsWith('qwen/') ? effectiveModel : DEFAULT_QWEN_MODEL;
    return contentGeneratorConfig;
  }

  // Qwen DeepInfra configuration
  if (authType === AuthType.USE_QWEN_DEEPINFRA && qwenDeepInfraKey) {
    contentGeneratorConfig.apiKey = qwenDeepInfraKey;
    contentGeneratorConfig.baseUrl = 'https://api.deepinfra.com/v1/openai';
    contentGeneratorConfig.model = effectiveModel.startsWith('Qwen/') ? effectiveModel : 'Qwen/Qwen2.5-72B-Instruct-Turbo';
    return contentGeneratorConfig;
  }

  // Qwen AI/ML API configuration
  if (authType === AuthType.USE_QWEN_AIML && qwenAimlKey) {
    contentGeneratorConfig.apiKey = qwenAimlKey;
    contentGeneratorConfig.baseUrl = 'https://api.aimlapi.com/v1';
    contentGeneratorConfig.model = effectiveModel.startsWith('qwen/') ? effectiveModel : DEFAULT_QWEN_MODEL;
    return contentGeneratorConfig;
  }

  //
  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    !!googleApiKey &&
    googleCloudProject &&
    googleCloudLocation
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
): Promise<ContentGenerator> {
  const version = env.CLI_VERSION || '1.0.0';
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (linux; x64)`,
    },
  };
  if (config.authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return createCodeAssistContentGenerator(httpOptions, config.authType);
  }

  // Handle Qwen providers
  if (
    config.authType === AuthType.USE_QWEN_OPENROUTER ||
    config.authType === AuthType.USE_QWEN_DEEPINFRA ||
    config.authType === AuthType.USE_QWEN_AIML
  ) {
    const { createQwenContentGenerator } = await import('./qwenContentGenerator.js');
    return createQwenContentGenerator(config, httpOptions);
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
