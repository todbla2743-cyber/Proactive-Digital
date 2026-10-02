#!/usr/bin/env node
/** Build an explicitly nonproduction, offline-only copy of the real Lab UI. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REVIEW_CONTEXTS = ['deploy-preview', 'branch-deploy'];
export const REVIEW_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'";

function replaceRequired(html, expression, replacement, label) {
  if (!expression.test(html)) throw new Error('Lab review source changed: missing ' + label);
  return html.replace(expression, replacement);
}

export function sanitizeLabHTML(source) {
  let html = source.replace(/<script\b[^>]*\bsrc=["']https?:\/\/[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<link\b[^>]*\bhref=["']https?:\/\/[^>]*>/gi, '');
  html = replaceRequired(html, /const SB_URL = '[^']*';/, "const SB_URL = 'https://preview.invalid';", 'SB_URL');
  html = replaceRequired(html, /const SB_KEY = '[^']*';/, "const SB_KEY = 'synthetic-preview-no-credentials';", 'SB_KEY');
  // Do not distribute real fallback client records or personal business prompts in this copy.
  html = replaceRequired(html, /(let pipeline = JSON\.parse\([^\n]+\) \|\| )\[[\s\S]*?\n\];/, '$1[];', 'pipeline fallback');
  html = replaceRequired(html, /PROOF = \[\n[\s\S]*?\n  \];/, 'PROOF = [];', 'proof fallback');
  html = replaceRequired(html, /const BP_SYSTEM = `[\s\S]*?`;/, "const BP_SYSTEM = 'Synthetic preview: live AI is disabled.';", 'Blueprint system prompt');
  html = replaceRequired(html, /const systemPrompt = `You are The Lab AI[\s\S]*?`;/, "const systemPrompt = 'Synthetic preview: live AI is disabled.';", 'personal system prompt');
  html = html.replaceAll('/.netlify/functions/lab-ai', '/__lab_review__/lab-ai')
    // Preserve SVG namespace declarations; every navigable domain is a reserved dummy domain.
    .replace(/https?:\/\/[a-z0-9.-]+(?::\d+)?/gi, host => host === 'http://www.w3.org' ? host : 'https://preview.invalid')
    .replace(/hello@getproactivedigital\.com/g, 'reviewer@example.invalid')
    .replace(/Todd Blackwell Jr\.?|Todd|Robbyn|Ryleigh|Rudy|Brenda|Nicole/g, 'Reviewer')
    .replace(/SLP Masonry LLC|Jazz Barber &amp; Beauty|Jazz Barber & Beauty/g, 'Example project')
    .replace(/<title>[^<]*<\/title>/, '<title>PREVIEW · Synthetic Lab review</title>');
  // Make static navigation inert even before the runtime guard starts.
  html = html.replace(/(<a\b[^>]*?)\bhref=("[^"]*"|'[^']*')/gi, '$1data-review-disabled-href=$2 aria-disabled="true"')
    .replace(/\btarget=["']_blank["']/gi, '')
    .replace(/\baction=["'][^"']*["']/gi, 'action="#"');
  const bootstrap = `<meta http-equiv="Content-Security-Policy" content="${REVIEW_CSP}">\n<script src="/lab-review-harness.js"></script>\n<script>const localStorage = window.LabReview.storage; const sessionStorage = window.LabReview.storage;</script>\n<style id="lab-review-style">[data-netlify-deploy-id]{display:none!important}#lab-review-banner{position:sticky;top:0;z-index:10000;padding:10px 16px;background:#ffe6a6;color:#17212e;font:700 13px/1.5 system-ui;text-align:center}#lab-review-banner small{display:block;font-weight:500}#lab-review-banner a{color:inherit}#workspace-save-bar::before{content:'SIMULATED:';font-weight:700;color:#ffe6a6}[data-review-disabled]{opacity:.45!important;cursor:not-allowed!important}#login-screen{display:none!important}</style>`;
  html = html.replace('<head>', '<head>\n' + bootstrap);
  html = html.replace('<body>', '<body>\n<aside id="lab-review-banner" role="status">PREVIEW / SYNTHETIC DATA / resets on reload<small>Offline fixture. Use made-up data only. No live AI, account access, email, payments, or cloud saves.</small><span id="lab-review-state">Initializing preview…</span></aside>');
  html = html.replace('</body>', '<script>window.LabReview.boot();</script>\n</body>');
  return html;
}

/** Serialized into the generated harness. It intentionally contains no network fallback. */
function reviewHarness() {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = new Date(), at = now.toISOString();
  const monthDate = offset => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 12, 12);
    return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), '12'].join('-');
  };
  const records = [
    {id:'review-proposal', name:'Example Studio', status:'proposal', dealValue:450, notes:'Synthetic website project. Original details for edit testing.', nextAction:'Review the mockup', priority:'normal'},
    {id:'review-won', name:'Example Workshop', status:'won', dealValue:600, notes:'Synthetic completed project, separate from monthly care.', nextAction:'Confirm the handoff', priority:'high'},
    {id:'review-new', name:'Example Garden', status:'new', dealValue:250, notes:'Synthetic prospect with no confirmed due date.', nextAction:'Prepare sample questions', priority:'normal'}
  ].map(record => ({contact:'',email:null,phone:null,website:null,site:null,address:null,niche:'sample business',source:'synthetic-preview',issue:'',services:[],statusHistory:[{status:record.status,at:monthDate(-1)+'T12:00:00Z'}],touches:[],nextActionDate:null,recurringValue:0,hasRetainer:false,payments:[],createdAt:at,updatedAt:at,...record}));
  const care = (id,name,status) => ({id,name,contact:'',description:'Synthetic monthly care example. Dates are intentionally unknown.',recordId:null,monthlyPlan:{status,amount:65,startDate:null,endDate:null},createdAt:at,updatedAt:at,history:[]});
  const activity = (id,title,status,month) => ({id,project:'Example Studio',title,date:monthDate(month),owner:'Demo reviewer',due:null,status,priority:'normal',nextAction:'Review synthetic details',details:'Made-up fixture evidence; no customer data.',createdAt:at,updatedAt:at,statusHistory:[{status,at}]});
  const data = {
    records,pipeline:[],clients:[],leads:[],proof:[],swipe:[],settings:{},saved_chats:[],memory_summaries:[],
    management:{clients:[care('review-care-active','Example Active Care','active'),care('review-care-upcoming','Example Upcoming Care','upcoming')]},
    project_notes:[{id:'review-note',project:'Example Studio',title:'Synthetic project reference',body:'These are made-up notes for preview testing. Changes last only until reload.',archived:false,updatedAt:at}],
    activity:[activity('review-older-open','Prior-month open follow-up','waiting',-2),activity('review-recent-open','Last-month next action','in_progress',-1),{...activity('review-completed','Completed synthetic work','done',-2),completedAt:at}]
  };
  const orders = [
    {id:'review-order-test',customerName:'Sample Customer',item:'Demo shirt',service:'Synthetic print',status:'New',quoteTotal:'$120',startingEstimate:'$100',depositInvoiceUrl:null},
    {id:'review-order-normal',customerName:'Example Customer',item:'Cotton shirt',service:'Screen printing',status:'In Production',quoteTotal:'$240',startingEstimate:'$220',depositInvoiceUrl:null}
  ];
  const memory = new Map();
  const storage = Object.freeze({
    get length(){return memory.size;}, key(index){return [...memory.keys()][index]??null;},
    getItem(key){return memory.get(String(key))??null;}, setItem(key,value){memory.set(String(key),String(value));},
    removeItem(key){memory.delete(String(key));},clear(){memory.clear();}
  });
  // Install before any original script, including initializers that read local caches.
  Object.defineProperty(window,'localStorage',{get:()=>storage,configurable:true});
  Object.defineProperty(window,'sessionStorage',{get:()=>storage,configurable:true});
  for(const [key,value] of Object.entries(data)) {
    const localKey = ({proof:'lab_proof_v2',swipe:'lab_swipe_file'})[key] || 'lab_'+key;
    storage.setItem(localKey,JSON.stringify(value));
  }
  storage.setItem('lab_migrated_v2','true');storage.setItem('lab_sb_migrated','1');
  storage.setItem('lab_stocks','[]');storage.setItem('lab_pending_writes','{}');
  const requests=[],blocked=[];
  const response=(body,status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=>null},json:async()=>clone(body),text:async()=>JSON.stringify(body),clone(){return response(body,status);}});
  const fail = target => {blocked.push(String(target));return response({ok:false,error:{message:'Disabled in synthetic preview. No network request was sent.'}},403);};
  window.fetch = async (input, options={}) => {
    const url = typeof input==='string'?input:input?.url;
    let body={};try{body=JSON.parse(options.body||'{}');}catch{return fail('Malformed preview request');}
    requests.push({url:String(url),action:body.action||'readiness',key:body.key||null});
    if(url==='/__lab_review__/lab-ai') {
      if(!options.method||options.method==='GET')return response({ok:true,configured:true,access_configured:true,model:'synthetic preview (no AI calls)',fast_model:'offline fixture'});
      if(body.action==='authenticate')return response({ok:true});
      return fail('Live AI');
    }
    // The unchanged workspace module calls its normal path; this function never delegates it.
    if(url==='/.netlify/functions/lab-store') {
      if(body.action==='load')return response({ok:true,data,updatedAt:at});
      if(body.action==='save'&&Object.prototype.hasOwnProperty.call(data,body.key)) {
        data[body.key]=clone(body.value);return response({ok:true,key:body.key});
      }
      return fail('Unsupported synthetic store action');
    }
    return fail(url);
  };
  function disabled(){throw new Error('Networking is disabled in this synthetic preview.');}
  for(const key of ['XMLHttpRequest','WebSocket','EventSource','WebTransport','Worker','SharedWorker','RTCPeerConnection']) {
    try{Object.defineProperty(window,key,{value:disabled,writable:false,configurable:false});}catch{}
  }
  try{Object.defineProperty(navigator,'sendBeacon',{value:()=>false});}catch{}
  window.open=()=>{blocked.push('External window');return null;};
  const noteBlocked=()=>{const el=document.getElementById('lab-review-state');if(el)el.textContent='That action is disabled in this synthetic preview.';};
  const blockedActions=/\b(openLink|openSearch|saveSbAuth|testSbAuth|copyRlsSql|copyContract|viewContract|togglePayment|sendMessage|bpSend|bpQuick|bpTopic|runLeadSearch|lfFindIntent|exportBackup|importBackup|exportLeads|lfExport|copyOutreach)\s*\(|(?:file-input|import-input)/;
  function lockControls() {
    document.querySelectorAll('a,[onclick],input[type=file],input[type=password],#sb-auth-email').forEach(el=>{
      if(el.matches('a,input[type=file],input[type=password],#sb-auth-email')||blockedActions.test(el.getAttribute('onclick')||'')) {
        el.dataset.reviewDisabled='true';el.setAttribute('aria-disabled','true');el.title='Disabled in synthetic preview';
        if(el.tagName==='A'){el.removeAttribute('href');el.removeAttribute('target');el.removeAttribute('onclick');}
        if('disabled'in el)el.disabled=true;
      }
    });
    document.querySelectorAll('form').forEach(el=>{el.setAttribute('action','#');el.removeAttribute('target');});
  }
  document.addEventListener('click',event=>{
    const el=event.target.closest?.('a,[data-review-disabled]');
    if(el){event.preventDefault();event.stopImmediatePropagation();noteBlocked();}
  },true);
  // Local editor submit handlers still run; native navigation/submission never does.
  document.addEventListener('submit',event=>event.preventDefault(),true);
  HTMLFormElement.prototype.submit=noteBlocked;
  const mutationObserver=new MutationObserver(lockControls);
  mutationObserver.observe(document,{childList:true,subtree:true});
  let started=false;
  window.LabReview=Object.freeze({
    storage,requests,blocked,snapshot:()=>clone(data),
    async boot(){
      if(started)return;started=true;
      try{
        // These are preview-only service seams; all record editing/rendering stays original.
        window.loadDFOrders=async()=>clone(orders);
        window.injectSecurityCenter=()=>{};
        window.openLink=noteBlocked;window.openSearch=noteBlocked;
        window.saveSbAuth=noteBlocked;window.testSbAuth=noteBlocked;
        document.getElementById('pw-input').value='SYNTHETIC-PREVIEW';
        await window.doLogin();
        // Initialization renders the feed asynchronously; seed again after it has settled.
        await Promise.resolve();
        _dfFeedCache=clone(orders);
        window.renderDFFeedData(_dfFeedCache);
        lockControls();
        document.getElementById('lab-review-state').textContent='Ready · all edits stay in this tab until reload';
        document.documentElement.dataset.labReviewReady='true';
      }catch(error){
        document.getElementById('lab-review-state').textContent='Preview could not initialize safely: '+error.message;
        document.documentElement.dataset.labReviewReady='error';throw error;
      }
    }
  });
}

export async function buildLabReview({distDir,sourceDir=ROOT,context=process.env.CONTEXT}={}) {
  if(!REVIEW_CONTEXTS.includes(context))throw new Error('Synthetic Lab review requires CONTEXT=deploy-preview or CONTEXT=branch-deploy; production/default builds are forbidden.');
  if(!distDir)throw new Error('Pass an explicit publish directory.');
  const html=sanitizeLabHTML(await readFile(resolve(sourceDir,'lab.html'),'utf8'));
  await mkdir(distDir,{recursive:true});
  await writeFile(resolve(distDir,'lab-review.html'),html);
  await writeFile(resolve(distDir,'lab-review-harness.js'),'/* Generated synthetic fixture. Never use with the production Lab. */\n('+reviewHarness.toString()+')();\n');
  return {htmlPath:resolve(distDir,'lab-review.html'),harnessPath:resolve(distDir,'lab-review-harness.js')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const result=await buildLabReview({distDir:process.argv[2]&&resolve(process.argv[2])});
  console.log('Built offline synthetic Lab review: '+result.htmlPath);
}
