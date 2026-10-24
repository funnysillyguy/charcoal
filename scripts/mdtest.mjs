import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const server = await createServer({ root: '/home/claude/charcoal', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { Markdown } = await server.ssrLoadModule('/src/lib/markdown.jsx');
const cases = [
  '**It was 7:03 PM.**',
  '“You always walk around this part of the city?” **he asked quietly.** “Kinda nice when it’s quiet like this.”',
  '***— Now —***',
  '((Character from "I Think I Like You" furry WEBTOON comic.))',
  'Name: Leon\nAge: 25',
];
for (const c of cases) {
  const t = Date.now();
  console.log('start', JSON.stringify(c.slice(0, 30)));
  const out = renderToStaticMarkup(React.createElement(Markdown, { text: c }));
  console.log('  ', Date.now() - t, 'ms', out.slice(0, 200));
}
await server.close();
