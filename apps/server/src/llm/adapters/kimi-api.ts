/**
 * Kimi API Adapter (Moonshot AI)
 * Uses OpenAI-compatible API
 */

import { BaseLLMAdapter } from './base';
import type { LLMType, LLMMethod } from '../types';
import { getEffectiveKey, isKeyDisabled } from '../key-manager';

export class KimiAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'kimi';
  readonly method: LLMMethod = 'api';
  readonly name = 'Kimi K2.5 (API)';

  private readonly endpoint = 'https://api.moonshot.ai/v1/chat/completions';
  private readonly model = 'kimi-k2.5';
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getApiKey(): string | undefined {
    return getEffectiveKey('kimi');
  }

  async isAvailable(): Promise<boolean> {
    if (isKeyDisabled('kimi')) return false;
    return !!this.getApiKey();
  }

  protected async callLLM(prompt: string): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('MOONSHOT_API_KEY not set');
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
        throw new Error(`Kimi API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices[0]?.message?.content ?? '';
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Kimi API timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}
