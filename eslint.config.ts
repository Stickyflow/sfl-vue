import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfigWithVueTs(
  { name: 'app/files-to-lint', files: ['**/*.{ts,mts,vue}'] },
  { name: 'app/files-to-ignore', ignores: ['dist/**'] },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  // Formatting is Prettier's job; this turns off every ESLint rule that
  // would fight it.
  skipFormatting,
)
