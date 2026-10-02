import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const baseline=JSON.parse(fs.readFileSync(new URL('./lab-isolation-baseline.json',import.meta.url),'utf8'));
test('Design Fusion feed and legacy payment code remain byte-identical to verified production source',()=>{
 const source=read('lab.html');
 for(const item of baseline.regions){const start=source.indexOf(item.start);assert(start>=0,item.label);const end=source.indexOf(item.end,start+item.start.length);assert(end>start,item.label);assert.equal(hash(source.slice(start,end)),item.sha256,item.label);}
 for(const [file,sha] of Object.entries(baseline.files))assert.equal(hash(read(file)),sha,file);
});
test('Lab order review has no network, persistence, original renderer override, or mutation calls',()=>{
 const review=read('lab-order-review.js');
 assert(!/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|SB|supabase)\b/.test(review));
 assert(!/\.(insert|update|delete|upsert|splice|push)\s*\(/.test(review));
 assert(!/renderDFFeed\s*=|_dfFeedCache\s*=/.test(review));
});
