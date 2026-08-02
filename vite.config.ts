import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { SFL_PRIMER } from './src/sflPrimer';

type Provider = 'openai' | 'anthropic';

/** Same routing rule as examples/sfl-chat's vite.config.ts: a "claude…" model
 *  name goes to Anthropic, anything else goes to OpenAI. See that file for the
 *  full reasoning — copied here rather than shared because examples are
 *  self-contained (see the package README). */
function providerFor(model: string): Provider {
  return model.startsWith('claude') ? 'anthropic' : 'openai';
}

/**
 * The LLM call lives here, in Vite's dev server, rather than in the browser —
 * an API key shipped to the client is readable by anyone who opens devtools.
 *
 * Deliberately simpler than sfl-chat's version of this file: there's no
 * `observe` mode here, because that feature depends on `stickyflow/interaction`
 * reporting drag/resize/text-edit gestures, and this demo renders through the
 * `<stickyflow-diagram>` web component instead, which doesn't expose that tier
 * (see the package's Integration Tiers docs). One mode — a prompt in, a
 * document out — is the whole surface.
 */
function chatApi(env: Record<string, string>): Plugin {
  const openaiApiKey = env.OPENAI_API_KEY;
  const anthropicApiKey = env.ANTHROPIC_API_KEY;

  const openaiModel = env.OPENAI_MODEL || 'gpt-5.6-sol';
  const anthropicModel = env.ANTHROPIC_MODEL || 'claude-opus-5';

  // Same auto-detection as sfl-chat: an Anthropic-only setup (no
  // OPENAI_API_KEY at all) defaults to Claude; anything else defaults to
  // OpenAI, so a caller can force it either way with LLM_PROVIDER.
  const explicitProvider: Provider | undefined =
    env.LLM_PROVIDER === 'anthropic' || env.LLM_PROVIDER === 'openai' ? env.LLM_PROVIDER : undefined;
  const defaultProvider: Provider = explicitProvider ?? (anthropicApiKey && !openaiApiKey ? 'anthropic' : 'openai');
  const defaultModel = defaultProvider === 'anthropic' ? anthropicModel : openaiModel;

  const openaiBaseURL = env.OPENAI_BASE_URL || undefined;
  const anthropicBaseURL = env.ANTHROPIC_BASE_URL || undefined;

  const OPENAI_EFFORTS = ['low', 'medium', 'high'] as const;
  const configuredOpenAIEffort = env.OPENAI_REASONING_EFFORT;
  const openaiReasoningEffort = (OPENAI_EFFORTS as readonly string[]).includes(configuredOpenAIEffort)
    ? (configuredOpenAIEffort as (typeof OPENAI_EFFORTS)[number])
    : undefined;

  const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
  const configuredAnthropicEffort = env.ANTHROPIC_EFFORT;
  const anthropicEffort = (ANTHROPIC_EFFORTS as readonly string[]).includes(configuredAnthropicEffort)
    ? (configuredAnthropicEffort as (typeof ANTHROPIC_EFFORTS)[number])
    : undefined;

  return {
    name: 'sfl-vue-api',
    configureServer(server) {
      // Same shape as sfl-chat's /api/config — lets the UI name the actual
      // server default instead of an unhelpful bare placeholder, and warn
      // before the first request fails.
      server.middlewares.use('/api/config', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          model: defaultModel,
          provider: defaultProvider,
          baseURL: (defaultProvider === 'anthropic' ? anthropicBaseURL : openaiBaseURL) ?? null,
          hasApiKey: !!(defaultProvider === 'anthropic' ? anthropicApiKey : openaiApiKey),
        }));
      });

      // The system prompt as plain text, same purpose as sfl-chat's:
      // reproducing a turn elsewhere without an API key.
      server.middlewares.use('/api/prompt', (req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(SFL_PRIMER);
      });

      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'POST only' }));
        }
        res.setHeader('Content-Type', 'application/json');

        try {
          const body = await new Promise<string>((resolve, reject) => {
            let raw = '';
            req.on('data', chunk => { raw += chunk; });
            req.on('end', () => resolve(raw));
            req.on('error', reject);
          });
          const { messages, currentSfl, model: modelOverride } = JSON.parse(body) as {
            messages: Array<{ role: 'user' | 'assistant'; content: string }>;
            currentSfl: string | null;
            model?: string;
          };
          const model = modelOverride || defaultModel;
          const provider = providerFor(model);

          if (provider === 'anthropic' ? !anthropicApiKey : !openaiApiKey) {
            res.statusCode = 500;
            return res.end(JSON.stringify({
              error: provider === 'anthropic'
                ? 'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key, then restart the dev server.'
                : 'OPENAI_API_KEY is not set. Copy .env.example to .env and add your key, then restart the dev server.',
            }));
          }

          // Same reasoning as sfl-chat: the document is its own system turn,
          // separate from the primer, so the moving part (currentSfl) never
          // touches the stable prefix.
          const systemParts = [SFL_PRIMER];
          if (currentSfl) {
            systemParts.push(
              `The document currently on the canvas — the user may have moved or resized things since you last wrote it, so treat these coordinates as authoritative:\n\n\`\`\`sfl\n${currentSfl}\n\`\`\``,
            );
          }

          let reply: string;
          let modelUsed: string;
          let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

          if (provider === 'anthropic') {
            const client = new Anthropic({ apiKey: anthropicApiKey, baseURL: anthropicBaseURL });
            const response = await client.messages.create({
              model,
              max_tokens: 8192,
              system: systemParts.map((text, i) => ({
                type: 'text' as const,
                text,
                ...(i === 0 ? { cache_control: { type: 'ephemeral' as const } } : {}),
              })),
              messages,
              ...(anthropicEffort ? { output_config: { effort: anthropicEffort } } : {}),
            });
            const textBlock = response.content.find(
              (block): block is Anthropic.TextBlock => block.type === 'text',
            );
            reply = textBlock?.text ?? '';
            modelUsed = response.model;
            usage = response.usage && {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            };
          } else {
            const system = systemParts.map(text => ({ role: 'system' as const, content: text }));
            const client = new OpenAI({ apiKey: openaiApiKey, baseURL: openaiBaseURL });
            const completion = await client.chat.completions.create({
              model,
              messages: [...system, ...messages],
              ...(openaiReasoningEffort ? { reasoning_effort: openaiReasoningEffort } : {}),
            });
            const completionUsage = completion.usage;
            reply = completion.choices[0]?.message?.content ?? '';
            modelUsed = completion.model;
            usage = completionUsage && {
              promptTokens: completionUsage.prompt_tokens,
              completionTokens: completionUsage.completion_tokens,
              totalTokens: completionUsage.total_tokens,
            };
          }

          res.end(JSON.stringify({ reply, model: modelUsed, usage }));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      vue({
        template: {
          compilerOptions: {
            // <stickyflow-diagram> is a real custom element (registered by
            // defineStickyflowDiagram() in main.ts), not an unresolved Vue
            // component — without this Vue's compiler warns "failed to
            // resolve component" for it.
            isCustomElement: tag => tag === 'stickyflow-diagram',
          },
        },
      }),
      chatApi(env),
    ],
  };
});
