import type { Plugin } from 'vite'
import { providerFor, readServerConfig } from './config'
import { createAnthropicProvider } from './providers/anthropic'
import { createOpenAIProvider } from './providers/openai'
import { HttpError, parseChatRequest, readBody } from './request'
import { SFL_PRIMER } from './sflPrimer'

/**
 * The LLM call lives here, in Vite's dev server, rather than in the browser:
 * an API key shipped to the client is readable by anyone who opens devtools.
 *
 * One mode is the whole surface: a prompt in, a document out. The diagram
 * renders through the `<stickyflow-diagram>` web component, which doesn't
 * report edit gestures (see the package's Integration Tiers docs), so there
 * is nothing on the canvas side for the server to react to.
 */
export function chatApi(env: Record<string, string>): Plugin {
  const config = readServerConfig(env)

  // One client per provider for the server's lifetime, and only for a
  // provider that has a key: both SDKs throw at construction without one.
  const providers = {
    openai: config.openai.apiKey
      ? createOpenAIProvider({ ...config.openai, apiKey: config.openai.apiKey })
      : undefined,
    anthropic: config.anthropic.apiKey
      ? createAnthropicProvider({ ...config.anthropic, apiKey: config.anthropic.apiKey })
      : undefined,
  }

  return {
    name: 'sfl-vue-api',
    configureServer(server) {
      // Lets the UI warn about a missing API key before the first request
      // fails, and name the model the server will actually use.
      server.middlewares.use('/api/config', (req, res) => {
        const defaults = config[config.defaultProvider]
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            model: config.defaultModel,
            provider: config.defaultProvider,
            baseURL: defaults.baseURL ?? null,
            hasApiKey: !!defaults.apiKey,
          }),
        )
      })

      // The system prompt as plain text, for reproducing a turn elsewhere
      // without an API key.
      server.middlewares.use('/api/prompt', (req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(SFL_PRIMER)
      })

      server.middlewares.use('/api/chat', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end(JSON.stringify({ error: 'POST only' }))
        }

        try {
          const { messages, currentSfl } = parseChatRequest(await readBody(req))
          // No per-request model override: the UI never sends one, and
          // accepting any model name from the browser would let a caller
          // pick whatever (expensive) model the server's key can reach.
          const model = config.defaultModel
          const provider = providerFor(model)
          const complete = providers[provider]

          if (!complete) {
            const keyName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
            throw new HttpError(
              500,
              `${keyName} is not set. Copy .env.example to .env and add your key, then restart the dev server.`,
            )
          }

          // The document is its own system turn, separate from the primer, so
          // the moving part (currentSfl) never touches the stable, cacheable
          // prefix.
          const system = [SFL_PRIMER]
          if (currentSfl) {
            system.push(
              `The document currently on the canvas — the user may have moved or resized things since you last wrote it, so treat these coordinates as authoritative:\n\n\`\`\`sfl\n${currentSfl}\n\`\`\``,
            )
          }

          const { reply, model: modelUsed, usage } = await complete({ model, system, messages })
          res.end(JSON.stringify({ reply, model: modelUsed, usage }))
        } catch (error) {
          res.statusCode = error instanceof HttpError ? error.status : 500
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      })
    },
  }
}
