import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { comparisonFields } from './comparison-page.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export async function buildComparisonPage() {
  let html = await readFile(resolve(here, 'comparison-page.template.html'), 'utf8');
  const bundle = await build({ entryPoints: [resolve(here, 'comparison-page.mjs')], bundle: true,
    minify: true, format: 'iife', target: ['es2020'], write: false });
  for (const [key, value] of Object.entries(comparisonFields)) html = html.replaceAll(key, () => String(value));
  if (/__[A-Z_]+__/.test(html.replace('__COMPARISON_SCRIPT__', ''))) throw new Error('Unfilled comparison-page template field.');
  html = html.replace('__COMPARISON_SCRIPT__', () => bundle.outputFiles[0].text.replaceAll('</script', '<\\/script'));
  return { 'review/comparison.html': html };
}
