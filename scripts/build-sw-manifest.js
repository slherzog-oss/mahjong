// Erzeugt sw-manifest.js: Liste aller App-Dateien mit Inhalts-Hash für den
// Service Worker (Precache). Ohne Bundler; `node scripts/build-sw-manifest.js`.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = process.cwd();
const include = ['index.html', 'manifest.webmanifest', 'src', 'icons'];
const exclude = /(^|\/)(tests|docs|scripts|node_modules|\.git|LICENSE\.txt|.*\.md)$/;

function walk(path, out) {
  const full = join(root, path);
  const st = statSync(full);
  if (st.isDirectory()) {
    for (const name of readdirSync(full)) {
      const p = join(path, name);
      if (exclude.test(p)) continue;
      walk(p, out);
    }
  } else if (!exclude.test(path)) {
    out.push(path.split('\\').join('/'));
  }
}

const files = [];
for (const p of include) walk(p, files);
files.sort();
const hash = createHash('sha256');
const entries = files.map((f) => {
  const data = readFileSync(join(root, f));
  hash.update(f).update(data);
  return f;
});
const version = hash.digest('hex').slice(0, 12);
const body = `// Generiert von scripts/build-sw-manifest.js – nicht von Hand bearbeiten.\nself.__PRECACHE = ${JSON.stringify({ version, files: entries }, null, 2)};\n`;
writeFileSync(join(root, 'sw-manifest.js'), body);
console.log(`sw-manifest.js: ${entries.length} Dateien, Version ${version}`);
