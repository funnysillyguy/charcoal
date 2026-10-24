// Turns the single-file build (dist-single/index.html) into a page fragment for hosting as a
// claude.ai artifact: title + font link + inline style + root + inline module script.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = readFileSync(new URL('../dist-single/index.html', import.meta.url), 'utf8');
const pick = (re) => [...src.matchAll(re)].map((m) => m[0]);

const title = '<title>Charcoal</title>';
const fonts = pick(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g).join('\n');
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g).join('\n');
const scripts = pick(/<script type="module"[^>]*>[\s\S]*?<\/script>/g)
  .map((s) => s.replace(/\scrossorigin(="[^"]*")?/, ''))
  .join('\n');

const out = [title, '<meta name="theme-color" content="#121214">', fonts, styles, '<div id="root"></div>', scripts].join('\n');
mkdirSync(new URL('../artifact/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifact/charcoal.html', import.meta.url), out);
console.log(`artifact/charcoal.html: ${(out.length / 1024).toFixed(1)} KB`);
