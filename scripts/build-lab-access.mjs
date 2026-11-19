import { build } from 'esbuild';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publish = process.argv[2];
if (!publish) throw new Error('Publish directory required');
await Promise.all([
  build({ entryPoints: [join(root, 'lab-auth/sign-in.mjs')], outfile: join(publish, 'lab-google.js'), bundle: true, platform: 'browser', format: 'esm', minify: true }),
  copyFile(join(root, 'lab-auth/sign-in.html'), join(publish, 'lab-sign-in.html')),
  copyFile(join(root, 'lab-auth/workspace.js'), join(publish, 'lab-session.js')),
]);

// The provider returns some callbacks to the site home. Clear the fragment before public-page scripts run.
const callback = `<script>(()=>{const p=new URLSearchParams(location.hash.slice(1));if(['access_token','invite_token','error_description','error'].some(k=>p.has(k))){const hash=location.hash;history.replaceState(null,'',location.pathname+location.search);location.replace('/lab-sign-in.html'+hash);}})();</script>`;
for (const [file, anchor, replacement] of [
  ['index.html', '<head>', '<head>' + callback],
  ['lab.html', '</body>', '<script defer src="/lab-session.js"></script></body>'],
]) {
  const path = join(publish, file);
  const source = await readFile(path, 'utf8');
  if (!source.includes(anchor)) throw new Error(`Missing insertion point in ${file}`);
  await writeFile(path, source.replace(anchor, replacement));
}
