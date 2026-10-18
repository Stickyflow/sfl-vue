import OpenAI from 'openai'
import type { OpenAIEffort } from '../config'
import type { Complete } from './types'

export function createOpenAIProvider(options: {
  apiKey: string
  baseURL?: string
  reasoningEffort?: OpenAIEffort
}): Complete {
  const client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL })

  return async ({ model, system, messages }) => {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        ...system.map((text) => ({ role: 'system' as const, content: text })),
        ...messages,
      ],
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    })
    const usage = completion.usage
    return {
      reply: completion.choices[0]?.message?.content ?? '',
      model: completion.model,
      usage: usage && {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    }
  }
}
