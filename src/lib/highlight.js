// Tiny syntax highlighter for the Canvas code pane. Everything is escaped before it becomes markup.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, s) => `<span class="tk-${cls}">${esc(s)}</span>`;

const JS_KW =
  'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield true false null undefined';
const PY_KW =
  'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield';
const kwSet = (s) => new Set(s.split(' '));
const JS_SET = kwSet(JS_KW);
const PY_SET = kwSet(PY_KW);

function highlightJs(src) {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?)|(\b\d[\d_.]*(?:e[+-]?\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += span('c', m[1]);
    else if (m[2]) out += span('s', m[2]);
    else if (m[3]) out += span('n', m[3]);
    else if (m[4]) {
      if (JS_SET.has(m[4])) out += span('k', m[4]) + esc(m[5] || '');
      else if (m[5]) out += span('f', m[4]) + esc(m[5]);
      else out += esc(m[4]);
    }
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

function highlightPy(src) {
  const re = /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|[rbfRBF]{0,2}"(?:\\.|[^"\\\n])*"?|[rbfRBF]{0,2}'(?:\\.|[^'\\\n])*'?)|(\b\d[\d_.]*(?:e[+-]?\d+)?\b)|([A-Za-z_]\w*)(\s*\()?/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += span('c', m[1]);
    else if (m[2]) out += span('s', m[2]);
    else if (m[3]) out += span('n', m[3]);
    else if (m[4]) {
      if (PY_SET.has(m[4])) out += span('k', m[4]) + esc(m[5] || '');
      else if (m[5]) out += span('f', m[4]) + esc(m[5]);
      else out += esc(m[4]);
    }
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

function highlightCss(src) {
  const re = /(\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(@[\w-]+)|(#[0-9a-fA-F]{3,8}\b)|(-?\b\d[\d.]*(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|([\w-]+)(?=\s*:(?!:))/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += span('c', m[1]);
    else if (m[2]) out += span('s', m[2]);
    else if (m[3]) out += span('k', m[3]);
    else if (m[4] || m[5]) out += span('n', m[4] || m[5]);
    else if (m[6]) out += span('p', m[6]);
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

function highlightTag(tag) {
  // <div class="x" id=y>  or  </div>  or  <!doctype html>
  if (/^<!doctype/i.test(tag)) return span('c', tag);
  const m = /^(<\/?)([\w:-]*)([\s\S]*?)(\/?>?)$/.exec(tag);
  if (!m) return esc(tag);
  let attrs = '';
  const re = /([\w:@.-]+)(\s*=\s*)?("[^"]*"?|'[^']*'?|[^\s"'>]+)?|\s+|[\s\S]/g;
  let a;
  while ((a = re.exec(m[3]))) {
    if (a[1]) {
      attrs += span('a', a[1]);
      if (a[2]) attrs += esc(a[2]);
      if (a[3]) attrs += span('s', a[3]);
    } else attrs += esc(a[0]);
  }
  return esc(m[1]) + span('t', m[2]) + attrs + esc(m[4]);
}

function highlightHtml(src) {
  const re = /(<!--[\s\S]*?(?:-->|$))|(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>|$)|(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>|$)|(<\/?[A-Za-z!][^>]*>?)/gi;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    out += esc(src.slice(last, m.index));
    if (m[1]) out += span('c', m[1]);
    else if (m[2]) out += highlightTag(m[2]) + highlightCss(m[3]) + (m[4] ? highlightTag(m[4]) : '');
    else if (m[5]) out += highlightTag(m[5]) + highlightJs(m[6]) + (m[7] ? highlightTag(m[7]) : '');
    else if (m[8]) out += highlightTag(m[8]);
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

export function highlight(code, lang = 'html') {
  const l = String(lang).toLowerCase();
  try {
    if (/^(html|htm|xhtml|svg|xml)$/.test(l)) return highlightHtml(code);
    if (/^(js|javascript|node|jsx)$/.test(l)) return highlightJs(code);
    if (/^(py|python|python3)$/.test(l)) return highlightPy(code);
    if (l === 'css') return highlightCss(code);
  } catch {
    /* fall through to plain text */
  }
  return esc(code);
}
