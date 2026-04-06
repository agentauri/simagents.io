/**
 * MiniMax API Adapter
 * Uses OpenAI-compatible API
 */

import { BaseLLMAdapter } from './base';
import type { LLMType, LLMMethod } from '../types';
import { getEffectiveKey, isKeyDisabled } from '../key-manager';

export class MiniMaxAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'minimax';
  readonly method: LLMMethod = 'api';
  readonly name = 'MiniMax M2.7 (API)';

  private readonly endpoint = 'https://api.minimax.io/v1/chat/completions';
  private readonly model = 'MiniMax-M2.7';
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getApiKey(): string | undefined {
    return getEffectiveKey('minimax');
  }

  async isAvailable(): Promise<boolean> {
    if (isKeyDisabled('minimax')) return false;
    return !!this.getApiKey();
  }

  protected async callLLM(prompt: string): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY not set');
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
        throw new Error(`MiniMax API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices[0]?.message?.content ?? '';
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MiniMax API timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}
