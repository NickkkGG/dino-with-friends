import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// shared/ also runs on the server, so it may only use arithmetic that gives the same bits on every engine,
// and it must not reach into the browser or into src/. This reads every .ts file under shared/ and expects no match of:
const FORBIDDEN =
  /Math\.random|\bDate\b|performance|Math\.(sin|cos|tan|atan2?|exp|log\w*|pow|sqrt|cbrt|hypot)\b|\*\*|\bwindow\b|\bdocument\b|localStorage|from ['"](\.\.\/)+src\//;

const SHARED_DIR = fileURLToPath(new URL('../../shared', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

// The rule is about code, so comments are blanked out first, with the other characters left where they were
// so line numbers stay true. It is a single pass over comments and string literals together: a "//" inside a
// block comment, a "/*" inside a line comment or a "//" inside a string must not hide the code after it.
// Strings are kept as they are, because the import path check has to see them.
const COMMENT_OR_STRING =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`/g;

function withoutComments(source: string): string {
  return source.replace(COMMENT_OR_STRING, (token) => (token.startsWith('/') ? token.replace(/[^\n]/g, ' ') : token));
}

function violations(source: string): string[] {
  return withoutComments(source)
    .split('\n')
    .flatMap((line, index) => {
      const hit = FORBIDDEN.exec(line);
      return hit ? [`line ${index + 1}: ${hit[0]}`] : [];
    });
}

it('keeps shared/ deterministic and independent of src/', () => {
  const files = sourceFiles(SHARED_DIR);
  expect(files, `no .ts files under ${SHARED_DIR}, so there is nothing to check`).not.toEqual([]);
  const found = files.flatMap((file) =>
    violations(readFileSync(join(SHARED_DIR, file), 'utf8')).map((hit) => `shared/${file} ${hit}`),
  );
  expect(found, `checked: ${files.join(', ')}`).toEqual([]);
});

it('flags every kind of thing the rule forbids', () => {
  for (const code of [
    'const r = Math.random();',
    'const t = Date.now();',
    'const t = performance.now();',
    'const d = Math.hypot(a, b);',
    'const s = Math.sin(a);',
    'const p = a ** 2;',
    'const w = window.innerWidth;',
    'const d = document.title;',
    'const v = localStorage.getItem(k);',
    "import { x } from '../../src/game/x';",
  ]) {
    expect(violations(code), code).not.toEqual([]);
  }
});

it('lets the allowed arithmetic and comments through', () => {
  for (const code of [
    'const x = Math.floor(a / b) + Math.imul(c, d) + (e >>> 3) + Math.min(f, Math.max(g, Math.abs(h)));',
    '// Date.now() and performance.now() belong to the browser build',
    '/** Not 2 ** 3, and no window or document either. */',
    'const a = 1; /* Math.random() */ const b = 2;',
  ]) {
    expect(violations(code), code).toEqual([]);
  }
});

it('does not let a comment or a string hide the code after it', () => {
  expect(violations('/* see http://example.com */\nconst r = Math.random();')).toEqual(['line 2: Math.random']);
  expect(violations('// opens a /* here\nconst r = Math.random();\n/* closes */')).toEqual(['line 2: Math.random']);
  expect(violations("const u = 'http://example.com'; const r = Math.random();")).toEqual(['line 1: Math.random']);
  expect(violations('const r = Math.random(); // fine')).toEqual(['line 1: Math.random']);
});
