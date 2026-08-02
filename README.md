# SFL Vue — the web-component round trip

The same round trip as [`examples/sfl-chat`](../sfl-chat) — an LLM writes SFL,
the diagram renders, the next turn edits it — but consumed from a **Vue**
project through `stickyflow/web-component`'s `<stickyflow-diagram>` tag
instead of the raw `stickyflow/viewer`/`stickyflow/interaction` JS API.
Where sfl-chat is the "full control" reference, this is the "least setup"
one: a plain custom element, framework binding only, no viewer lifecycle code
to write yourself.

It exists to answer one question concretely: **does stickyflow.js actually
work in Vue?** — see the site's Framework Integration docs for the general
answer; this is the working proof.

## Running it

```bash
cp .env.example .env      # then put an OpenAI and/or Anthropic key in it
npm install
npm run dev
```

Either key on its own is enough — see `.env.example`. Same dev-server-only
backend shape as sfl-chat: `/api/chat`, `/api/config`, `/api/prompt` are Vite
`configureServer` middleware, so **this runs under `npm run dev` only** —
`npm run build` emits static files with no backend, and don't expose the dev
server beyond localhost (`vite --host`) unless you also add rate limiting and
auth, neither of which is in scope here. See sfl-chat's own README for the
fuller version of this warning; it applies unchanged.

## What's different from sfl-chat

This is deliberately a **smaller slice**, not a Vue port of every sfl-chat
feature — the gaps are specific to what `<stickyflow-diagram>` does and
doesn't expose, not arbitrary cuts:

- **No canvas editing.** sfl-chat layers `stickyflow/interaction` on the
  viewer for drag-to-move, drag-to-resize, and double-click text edit. The
  web component only mounts `stickyflow/viewer` internally (`interactive`
  turns on click-to-select and pan/zoom) — `stickyflow/interaction` isn't
  wired into the tag yet (see the package's Integration Tiers docs, tier 3).
  If you need editing, that's the JS-API pattern shown in this site's
  Framework Integration docs (React tab) — plain lifecycle code, not
  something the web component gives you for free.
- **No Observation.** sfl-chat's "the turn with no prompt" feature listens to
  the same `stickyflow/interaction` edit events to trigger an unprompted
  remark. With no editing tier, there's nothing to observe — the feature has
  no equivalent here, not a simplified one.
- **No overlap guard.** sfl-chat rejects a reply whose new content was drawn
  ON TOP of existing content (not beside it, as instructed), via a geometry
  check against `stickyflow`'s parsed entity bounds. This demo keeps the
  cheaper duplicate guard (a byte-identical reply doesn't overwrite the
  diagram) but skips the overlap check, to keep `App.vue` focused on the
  framework-binding question this example is actually about.
- **No Settings dialog / per-browser model override.** Model and provider
  come from `.env` only. sfl-chat's Settings dialog is UI complexity that has
  nothing to do with Vue integration specifically; see its README if you want
  that pattern.
- **No multi-chat sidebar / localStorage persistence.** One chat, in memory,
  gone on reload.

Everything else — the SFL primer, the dual OpenAI/Anthropic backend with the
same `LLM_PROVIDER`/model-prefix routing, the one-diagram-per-chat rule, the
markdown-with-a-strict-allowlist rendering of replies — is the same idea,
reimplemented for Vue rather than shared code (see `src/sflPrimer.ts` and
`vite.config.ts` for why: examples are meant to be self-contained).

## The integration itself

Two lines register the tag, once, before the app mounts (`src/main.ts`):

```ts
import { defineStickyflowDiagram } from 'stickyflow/web-component'
defineStickyflowDiagram()
```

One line in `vite.config.ts` tells Vue's compiler it's a real custom element,
not an unresolved Vue component:

```ts
vue({
  template: {
    compilerOptions: {
      isCustomElement: (tag) => tag === 'stickyflow-diagram',
    },
  },
})
```

And the template binding itself (`src/App.vue`) is plain Vue — `:source`
takes the diagram text, `interactive` (bare, since it's a presence-checked
attribute — see the package's `DiagramConfig`) turns on click/pan/zoom:

```html
<stickyflow-diagram v-if="currentSfl" interactive :source="currentSfl" />
```

That's the entire embedding. Everything else in `App.vue` is ordinary chat-UI
state management that would look the same regardless of what's rendering the
diagram.

## Known limits

Beyond the sfl-chat-feature gaps listed above:

- One call per turn, no streaming — the UI simply waits, same as sfl-chat.
- The whole document is regenerated each turn, same as sfl-chat.
- Invalid SFL: the web component shows its own inline parse-error message
  (see `StickyflowDiagram`'s `rerender()`) rather than sfl-chat's status bar —
  the previous diagram doesn't stay mounted through an error here, since
  `:source` swaps directly.
