import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {buildLabReview, sanitizeLabHTML, REVIEW_CSP} from '../scripts/build-lab-review.mjs';
const source=await readFile(new URL('../lab.html',import.meta.url),'utf8');

test('review generation is fail-closed outside explicit preview contexts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lab-review-context-'));
  try{
    for(const context of [undefined,'','production','dev'])await assert.rejects(buildLabReview({distDir:dir,context}),/requires CONTEXT/);
    for(const context of ['deploy-preview','branch-deploy']){
      const result=await buildLabReview({distDir:dir,context});
      assert.match(await readFile(result.htmlPath,'utf8'),/PREVIEW \/ SYNTHETIC DATA \/ resets on reload/);
      new vm.Script(await readFile(result.harnessPath,'utf8'));
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('generated copy removes real credentials, defaults, personal prompts, and live endpoints',()=>{
  const html=sanitizeLabHTML(source);
  const originalURL=source.match(/const SB_URL = '([^']+)'/)[1];
  const originalKey=source.match(/const SB_KEY = '([^']+)'/)[1];
  assert(!html.includes(originalURL));assert(!html.includes(originalKey));
  assert.match(html,/const SB_URL = 'https:\/\/preview.invalid'/);
  assert.match(html,/const SB_KEY = 'synthetic-preview-no-credentials'/);
  assert.doesNotMatch(html,/supabase\.co|cdn\.jsdelivr\.net|fonts\.googleapis\.com|\/\.netlify\/functions\/|sb_publishable_/);
  assert.doesNotMatch(html,/Jazz Barber|SLP Masonry|Nicole \(food biz\)|close before Aruba|Review HTML site with Brenda|Army veteran, fitness|Associated Scaffolding|Ryleigh|Robbyn/);
  assert.doesNotMatch(html,/<a\b[^>]*\shref=/i);
  assert.doesNotMatch(html,/<(?:script|link)\b[^>]*(?:src|href)=["']https?:/i);
  const cspIndex=html.indexOf('Content-Security-Policy'),harnessIndex=html.indexOf('src="/lab-review-harness.js"');
  assert(cspIndex<harnessIndex);assert(harnessIndex<html.indexOf('const LAB_AI_GATEWAY'));
  for(const directive of ["connect-src 'none'","form-action 'none'","base-uri 'none'","object-src 'none'","frame-src 'none'","script-src 'self' 'unsafe-inline'"])assert(REVIEW_CSP.includes(directive));
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  assert.match(html,/src="\/lab-workspace.js\?/);assert.match(html,/src="\/lab-management.js\?/);
  assert.match(html,/window.LabReview.boot\(\)/);
  assert.throws(()=>sanitizeLabHTML(source.replace('const SB_KEY =','const renamedKey =')),/missing SB_KEY/);
});
