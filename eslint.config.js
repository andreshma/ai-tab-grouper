/**
 * ESLint flat config: correctness + security rules (no dynamic code, no HTML sinks).
 */
import js from '@eslint/js';
import globals from 'globals';

const securityRules = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-restricted-properties': ['error',
    { property: 'innerHTML', message: 'XSS sink: use textContent/replaceChildren.' },
    { property: 'outerHTML', message: 'XSS sink.' },
    { property: 'insertAdjacentHTML', message: 'XSS sink.' },
    { object: 'document', property: 'write', message: 'XSS sink.' },
  ],
  'no-restricted-globals': ['error', { name: 'importScripts', message: 'No remote code in MV3.' }],
  eqeqeq: ['error', 'always'],
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
};

export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions, chrome: 'readonly' },
    },
    rules: securityRules,
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js', 'bridge/**/*.js', 'bridge/**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: { ...securityRules, 'no-console': 'off' },
  },
];
