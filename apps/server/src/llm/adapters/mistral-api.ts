/**
 * Mistral AI API Adapter
 * Uses OpenAI-compatible API
 */

import { BaseLLMAdapter } from './base';
import type { LLMType, LLMMethod } from '../types';
import { getEffectiveKey, isKeyDisabled } from '../key-manager';

export class MistralAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'mistral';
  readonly method: LLMMethod = 'api';
  readonly name = 'Mistral Large (API)';

  private readonly endpoint = 'https://api.mistral.ai/v1/chat/completions';
  private readonly model = 'mistral-large-latest';
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getApiKey(): string | undefined {
    return getEffectiveKey('mistral');
  }

  async isAvailable(): Promise<boolean> {
    if (isKeyDisabled('mistral')) return false;
    return !!this.getApiKey();
  }

  protected async callLLM(prompt: string): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY not set');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: this.getDecisionTemperature(),
          max_tokens: this.getDecisionMaxTokens(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Mistral API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices[0]?.message?.content ?? '';
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Mistral API timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}
