import { createHash, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

declare const Netlify: { env: { get(name: string): string | undefined } };
const keys = ['records','pipeline','clients','leads','proof','swipe','settings','saved_chats','memory_summaries','project_notes','activity'];
const json = (status: number, data: unknown) => Response.json(data, {status,headers:{'Cache-Control':'no-store'}});
export function makeHandler(openStore: typeof getStore = getStore) {
  return async (req: Request, context?: {deploy?:{context?:string}}) => {
    if(req.method !== 'POST')return json(405,{error:'Method not allowed.'});
    const origin=req.headers.get('origin');
    if(origin && origin !== new URL(req.url).origin)return json(403,{error:'Use the Lab on this website.'});
    const expected=Netlify.env.get('LAB_ACCESS_CODE_SHA256')||'';
    const code=req.headers.get('X-Lab-Access-Code')||'';
    if(!code || code.length>256 || !/^[a-f0-9]{64}$/i.test(expected) || !timingSafeEqual(createHash('sha256').update(code.replace(/\s/g,'').toUpperCase()).digest(),Buffer.from(expected,'hex')))
      return json(401,{error:'Sign in with your Lab access code to sync.'});
    let body: any;
    try{const raw=await req.text();if(Buffer.byteLength(raw)>4_000_000)return json(413,{error:'Workspace data is too large. Export a backup and reduce large attachments.'});body=JSON.parse(raw);}catch{return json(400,{error:'Invalid request.'});}
    if(!body || !['load','save'].includes(body.action))return json(400,{error:'Invalid action.'});
    if(body.action==='save' && (!keys.includes(body.key) || body.value===null || typeof body.value!=='object'))return json(400,{error:'Invalid workspace collection.'});
    try{
      const environment=context?.deploy?.context==='production'?'production':'preview';
      const store=openStore({name:'lab-workspace-v1-'+environment,consistency:'strong'});
      if(body.action==='save'){
        const updatedAt=new Date().toISOString();
        await store.setJSON(body.key,{value:body.value,updatedAt});
        return json(200,{ok:true,key:body.key,updatedAt});
      }
      const entries=await Promise.all(keys.map(async key=>[key,await store.get(key,{type:'json'})] as const));
      const data: Record<string,unknown>={};let updatedAt='';
      for(const [key,entry] of entries){if(entry && typeof entry==='object' && 'value' in entry){data[key]=entry.value;const at=String(entry.updatedAt||'');if(at>updatedAt)updatedAt=at;}}
      return json(200,{ok:true,data,updatedAt});
    }catch{return json(503,{error:'Cloud storage is unavailable. Your local changes remain queued for retry.'});}
  };
}
export default makeHandler();
export const config={rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain']}};
