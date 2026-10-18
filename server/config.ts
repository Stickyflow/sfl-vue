export type Provider = 'openai' | 'anthropic'

const OPENAI_EFFORTS = ['low', 'medium', 'high'] as const
const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export type OpenAIEffort = (typeof OPENAI_EFFORTS)[number]
export type AnthropicEffort = (typeof ANTHROPIC_EFFORTS)[number]

export interface ServerConfig {
  defaultProvider: Provider
  defaultModel: string
  openai: { apiKey?: string; model: string; baseURL?: string; reasoningEffort?: OpenAIEffort }
  anthropic: { apiKey?: string; model: string; baseURL?: string; effort?: AnthropicEffort }
}

/** A "claude…" model name goes to Anthropic, anything else to OpenAI. The
 *  model name alone decides, so there is no separate provider setting to
 *  keep in sync with it. */
export function providerFor(model: string): Provider {
  return model.startsWith('claude') ? 'anthropic' : 'openai'
}

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined): T | undefined {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : undefined
}

/** Reads everything the API needs from the dev server's env (`.env` plus
 *  process env, via Vite's loadEnv). Unknown effort values are ignored rather
 *  than forwarded, so a typo can't turn into a provider-side 400. */
export function readServerConfig(env: Record<string, string>): ServerConfig {
  const openai = {
    apiKey: env.OPENAI_API_KEY || undefined,
    model: env.OPENAI_MODEL || 'gpt-5.6-sol',
    baseURL: env.OPENAI_BASE_URL || undefined,
    reasoningEffort: oneOf(OPENAI_EFFORTS, env.OPENAI_REASONING_EFFORT),
  }
  const anthropic = {
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    model: env.ANTHROPIC_MODEL || 'claude-opus-5',
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
    effort: oneOf(ANTHROPIC_EFFORTS, env.ANTHROPIC_EFFORT),
  }

  // An Anthropic-only setup (no OPENAI_API_KEY at all) defaults to Claude;
  // anything else defaults to
  // OpenAI, so a caller can force it either way with LLM_PROVIDER.
  const defaultProvider: Provider =
    oneOf(['openai', 'anthropic'] as const, env.LLM_PROVIDER) ??
    (anthropic.apiKey && !openai.apiKey ? 'anthropic' : 'openai')

  return {
    defaultProvider,
    defaultModel: defaultProvider === 'anthropic' ? anthropic.model : openai.model,
    openai,
    anthropic,
  }
}
