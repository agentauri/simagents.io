/**
 * Gemini API Adapter
 * Uses Google AI API directly for reliable, controllable LLM calls
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLMAdapter, type RawPromptOptions, type RawPromptResult } from './base';
import type { LLMType, LLMMethod } from '../types';

export class GeminiAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'gemini';
  readonly method: LLMMethod = 'api';
  readonly name = 'Gemini (API)';

  private client: GoogleGenerativeAI | null = null;
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      this.client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    }
    return this.client;
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.GOOGLE_AI_API_KEY;
  }

  protected async callLLM(prompt: string): Promise<string> {
    const client = this.getClient();
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  /**
   * Call the LLM with a raw prompt and custom options.
   * Used by Genesis system for meta-generation.
   */
  override async callWithRawPrompt(
    prompt: string,
    options?: RawPromptOptions
  ): Promise<RawPromptResult> {
    const client = this.getClient();
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        maxOutputTokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.8,
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response;

    return {
      response: response.text(),
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    };
  }
}
