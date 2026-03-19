/**
 * GLM API Adapter
 * Uses OpenAI-compatible API (Zhipu AI)
 * Now extends BaseLLMAdapter for full action space parity with other adapters.
 */

import { BaseLLMAdapter } from './base';
import type { LLMType, LLMMethod } from '../types';
import { getEffectiveKey, isKeyDisabled } from '../key-manager';

export class GLMAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'glm';
  readonly method: LLMMethod = 'api';
  readonly name = 'GLM-5 (API)';

  private readonly endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  private readonly model = 'glm-5';
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getApiKey(): string | undefined {
    return getEffectiveKey('glm');
  }

  async isAvailable(): Promise<boolean> {
    if (isKeyDisabled('glm')) return false;
    return !!this.getApiKey();
  }

  protected async callLLM(prompt: string): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GLM_API_KEY not set');
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
        throw new Error(`GLM API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      const rawResponse = data.choices[0]?.message?.content ?? '';

      // GLM sometimes wraps JSON in markdown code blocks — extract it
      return this.extractJSON(rawResponse) ?? rawResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`GLM API timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Extract JSON from response that may contain extra text or markdown
   */
  private extractJSON(text: string): string | null {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*?"action"[\s\S]*?"params"[\s\S]*?\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    const anyJsonMatch = cleaned.match(/\{[^{}]*\}/);
    if (anyJsonMatch) {
      return anyJsonMatch[0];
    }

    return null;
  }
}
