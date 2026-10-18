import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicEffort } from '../config';
import type { Complete } from './types';

export function createAnthropicProvider(options: {
  apiKey: string;
  baseURL?: string;
  effort?: AnthropicEffort;
}): Complete {
  const client = new Anthropic({ apiKey: options.apiKey, baseURL: options.baseURL });

  return async ({ model, system, messages }) => {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: system.map((text, i) => ({
        type: 'text' as const,
        text,
        ...(i === 0 ? { cache_control: { type: 'ephemeral' as const } } : {}),
      })),
      messages,
      ...(options.effort ? { output_config: { effort: options.effort } } : {}),
    });
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    return {
      reply: textBlock?.text ?? '',
      model: response.model,
      usage: response.usage && {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  };
}
