import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const directory = process.argv[2];
if (!directory) throw new Error('Publish directory required');
for (const file of await readdir(directory)) {
  if (!file.endsWith('.html') || /^lab(?:[.-]|$)|^google.*\.html$/i.test(file)) continue;
  const path = join(directory, file);
  let html = await readFile(path, 'utf8');
  if (!/<\/head>/i.test(html)) throw new Error('Missing head: ' + file);
  if (html.includes('src="/analytics.js"')) continue;
  html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="/analytics.css"><script src="/analytics.js" defer></script></head>');
  await writeFile(path, html);
}
