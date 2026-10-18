import { computed, ref } from 'vue'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sfl-vue:theme'

const media = window.matchMedia('(prefers-color-scheme: dark)')
const systemTheme = ref<Theme>(media.matches ? 'dark' : 'light')
media.addEventListener('change', (event) => {
  systemTheme.value = event.matches ? 'dark' : 'light'
})

// null follows the OS setting; set once the toggle is used.
const chosenTheme = ref<Theme | null>(readStoredTheme())

function readStoredTheme(): Theme | null {
  // Storage can throw (blocked site data, some private windows); the page
  // then just follows the OS setting.
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

/** Sets data-theme on <html>, which style.css maps to color-scheme. Called
 *  once before mount so a saved choice applies on the first paint. */
export function applyTheme() {
  const root = document.documentElement
  if (chosenTheme.value) root.dataset.theme = chosenTheme.value
  else delete root.dataset.theme
}

export function useTheme() {
  const theme = computed<Theme>(() => chosenTheme.value ?? systemTheme.value)

  function toggleTheme() {
    chosenTheme.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(STORAGE_KEY, chosenTheme.value)
    } catch {
      // Not saved; the choice still holds until reload.
    }
    applyTheme()
  }

  return { theme, toggleTheme }
}
