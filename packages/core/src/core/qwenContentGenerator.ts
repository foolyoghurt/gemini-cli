/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  Tool,
  GenerateContentConfig,
  FinishReason,
  FunctionDeclaration,
} from '@google/genai';
import { ContentGenerator, ContentGeneratorConfig } from './contentGenerator.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class QwenContentGenerator implements ContentGenerator {
  private apiKey: string;
  private baseUrl: string;
  private httpOptions: any;

  constructor(config: ContentGeneratorConfig, httpOptions: any) {
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://api.openrouter.ai/v1';
    this.httpOptions = httpOptions;
  }

  private convertGeminiToOpenAI(contents: Content[]): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [];
    
    for (const content of contents) {
      if (content.role === 'model') {
        // Convert model response to assistant message
        const textParts = content.parts?.filter(part => 'text' in part) || [];
        const text = textParts.map(part => ('text' in part ? part.text : '')).join(' ');
        
        // Check for function calls
        const functionCallParts = content.parts?.filter(part => 'functionCall' in part) || [];
        if (functionCallParts.length > 0) {
          const toolCalls = functionCallParts.map((part, index) => {
            if ('functionCall' in part && part.functionCall) {
              return {
                id: `call_${Date.now()}_${index}`,
                type: 'function' as const,
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args || {}),
                },
              };
            }
            return null;
          }).filter(Boolean);

          messages.push({
            role: 'assistant',
            content: text || null,
            tool_calls: toolCalls as any,
          });
        } else {
          messages.push({
            role: 'assistant',
            content: text,
          });
        }
      } else if (content.role === 'user') {
        // Convert user message
        const textParts = content.parts?.filter(part => 'text' in part) || [];
        const text = textParts.map(part => ('text' in part ? part.text : '')).join(' ');
        
        // Check for function responses
        const functionResponseParts = content.parts?.filter(part => 'functionResponse' in part) || [];
        if (functionResponseParts.length > 0) {
          // Handle function responses as separate tool messages
          for (const part of functionResponseParts) {
            if ('functionResponse' in part && part.functionResponse) {
              messages.push({
                role: 'tool',
                content: JSON.stringify(part.functionResponse.response),
                tool_call_id: `call_${part.functionResponse.name}`,
              });
            }
          }
        }
        
        if (text.trim()) {
          messages.push({
            role: 'user',
            content: text,
          });
        }
      }
    }
    
    return messages;
  }

  private convertOpenAIToGemini(response: OpenAIResponse): GenerateContentResponse {
    const choice = response.choices[0];
    const parts: Part[] = [];
    
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }
    
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === 'function') {
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments || '{}'),
            },
          });
        }
      }
    }

    // Map OpenAI finish reasons to Gemini FinishReason
    let finishReason: FinishReason | undefined;
    switch (choice.finish_reason) {
      case 'stop':
        finishReason = 'STOP' as FinishReason;
        break;
      case 'length':
        finishReason = 'MAX_TOKENS' as FinishReason;
        break;
      case 'tool_calls':
        finishReason = 'STOP' as FinishReason;
        break;
      default:
        finishReason = 'OTHER' as FinishReason;
    }

    return {
      candidates: [
        {
          content: {
            parts,
            role: 'model',
          },
          finishReason,
          index: choice.index,
        },
      ],
      usageMetadata: response.usage ? {
        promptTokenCount: response.usage.prompt_tokens,
        candidatesTokenCount: response.usage.completion_tokens,
        totalTokenCount: response.usage.total_tokens,
      } : undefined,
    };
  }

  async generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse> {
    const messages = this.convertGeminiToOpenAI(Array.isArray(request.contents) ? request.contents : []);
    
    // Add system instruction if present
    if (request.config?.systemInstruction) {
      const systemText = typeof request.config.systemInstruction === 'string' 
        ? request.config.systemInstruction
        : (request.config.systemInstruction as any)?.parts?.map((p: any) => 'text' in p ? p.text : '').join(' ') || '';
      
      messages.unshift({
        role: 'system',
        content: systemText,
      });
    }

    const requestBody: any = {
      model: request.model,
      messages,
      temperature: request.config?.temperature || 0,
      max_tokens: request.config?.maxOutputTokens || 4096,
    };

    // Handle tools if present
    if (request.config?.tools && request.config.tools.length > 0) {
      const tools = request.config.tools.flatMap((tool: any) => 
        tool.functionDeclarations?.map((func: FunctionDeclaration) => ({
          type: 'function',
          function: {
            name: func.name,
            description: func.description,
            parameters: func.parameters,
          },
        })) || []
      );
      
      if (tools.length > 0) {
        requestBody.tools = tools;
      }
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...this.httpOptions.headers,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Qwen API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as OpenAIResponse;
    return this.convertOpenAIToGemini(data);
  }

  async generateContentStream(request: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>> {
    const self = this;
    return (async function* () {
      const messages = self.convertGeminiToOpenAI(Array.isArray(request.contents) ? request.contents : []);
      
      // Add system instruction if present
      if (request.config?.systemInstruction) {
        const systemText = typeof request.config.systemInstruction === 'string' 
          ? request.config.systemInstruction
          : (request.config.systemInstruction as any)?.parts?.map((p: any) => 'text' in p ? p.text : '').join(' ') || '';
        
        messages.unshift({
          role: 'system',
          content: systemText,
        });
      }

      const requestBody: any = {
        model: request.model,
        messages,
        temperature: request.config?.temperature || 0,
        max_tokens: request.config?.maxOutputTokens || 4096,
        stream: true,
      };

      // Handle tools if present
      if (request.config?.tools && request.config.tools.length > 0) {
        const tools = request.config.tools.flatMap((tool: any) => 
          tool.functionDeclarations?.map((func: FunctionDeclaration) => ({
            type: 'function',
            function: {
              name: func.name,
              description: func.description,
              parameters: func.parameters,
            },
          })) || []
        );
        
        if (tools.length > 0) {
          requestBody.tools = tools;
        }
      }

      const response = await fetch(`${self.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${self.apiKey}`,
          ...self.httpOptions.headers,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Qwen API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                return;
              }
              
              try {
                const parsed = JSON.parse(data) as OpenAIResponse;
                const geminiResponse = self.convertOpenAIToGemini(parsed);
                yield geminiResponse;
              } catch (e) {
                // Skip invalid JSON lines
                continue;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    })();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Qwen doesn't provide a direct token counting API, so we estimate
    // This is a simple approximation: ~4 characters per token
    const messages = this.convertGeminiToOpenAI(request.contents);
    const text = messages.map(msg => msg.content || '').join(' ');
    const estimatedTokens = Math.ceil(text.length / 4);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Qwen providers typically don't support embeddings through OpenAI API
    // This would need to be implemented separately if embedding support is needed
    throw new Error('Embedding not supported for Qwen models via OpenAI-compatible API');
  }
}

export function createQwenContentGenerator(
  config: ContentGeneratorConfig,
  httpOptions: any,
): QwenContentGenerator {
  return new QwenContentGenerator(config, httpOptions);
}