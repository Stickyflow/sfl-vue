// Assistant replies are markdown — the model writes **bold**, bullet lists and
// GFM tables unprompted, and rendering them as literal text makes a good
// answer look like debug output.
//
// Parsing is `marked`; the safety story is ours. Model output is not trusted
// input: a prompt injection could put `<script>` or an `onerror=` attribute in
// a reply, and marked deliberately passes raw HTML through (its own `sanitize`
// option was removed years ago precisely so that this decision is made here,
// explicitly, rather than by a half-measure inside the parser). So everything
// marked produces goes through a strict allowlist walk before it reaches the
// document: unknown elements are unwrapped (their text survives, the tag
// doesn't), and every attribute is dropped except an http(s) href.
//
// Same allowlist as examples/sfl-chat's markdown.ts, adapted to return a
// sanitized HTML string instead of mutating a DOM element — a Vue template
// binds it with v-html rather than imperatively replacing children.
import { marked } from 'marked'

/** Tags the model legitimately produces via markdown. Anything else — script,
 *  iframe, style, svg, form, and every raw-HTML tag someone might inject — is
 *  unwrapped rather than removed outright, so injected *text* still shows up
 *  (visible, harmless, and honest about what the model said) while the element
 *  itself never exists. */
const ALLOWED_TAGS = new Set([
  'P',
  'BR',
  'HR',
  'SPAN',
  'STRONG',
  'B',
  'EM',
  'I',
  'DEL',
  'S',
  'CODE',
  'PRE',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
  'A',
])

function sanitize(root: ParentNode) {
  // Snapshot first: unwrapping mutates the tree while we walk it.
  for (const element of [...root.querySelectorAll('*')]) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes)
      continue
    }
    for (const attribute of [...element.attributes]) {
      const keep =
        element.tagName === 'A' &&
        attribute.name === 'href' &&
        /^https?:\/\//i.test(attribute.value.trim())
      if (!keep) element.removeAttribute(attribute.name)
    }
    if (element.tagName === 'A') {
      element.setAttribute('target', '_blank')
      element.setAttribute('rel', 'noopener noreferrer')
    }
  }
}

/** Renders `text` as sanitized markdown HTML, safe to bind with `v-html`. */
export function renderMarkdownToHtml(text: string): string {
  const html = marked.parse(text, { async: false, gfm: true, breaks: true })
  // Parse into a <template>, not a plain <div>: a div created by the live
  // document starts fetching <img src> the moment innerHTML is set, even while
  // detached, so `<img src=x onerror=...>` would fire its handler before (and
  // regardless of) the allowlist walk. Template content lives in an inert
  // document with no browsing context: nothing loads and no handler runs.
  const staging = document.createElement('template')
  staging.innerHTML = html
  sanitize(staging.content)
  return staging.innerHTML
}
