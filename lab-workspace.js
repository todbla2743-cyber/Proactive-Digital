/* Private workspace data lives in browser storage / lab_store, never in this bundle. */
(function(root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function markdown(value) {
    const tokens = [];
    const token = html => '\u0000' + (tokens.push(html) - 1) + '\u0000';
    const inline = text => {
      let safe = escape(text).replace(/`([^`]+)`/g, (_, code) => token('<code>'+code+'</code>'));
      safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => token('<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+label+'</a>'));
      return safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    };
    const lines = String(value ?? '').replace(/\u0000/g, '').replace(/\r/g, '').split('\n');
    let html = '', list = '', code = null;
    const closeList = () => { if(list) {html += '</'+list+'>'; list='';} };
    for (const line of lines) {
      if (/^\s*```/.test(line)) { closeList(); if(code !== null) {html += '<pre><code>'+escape(code.join('\n'))+'</code></pre>';code=null;} else code=[];continue; }
      if(code !== null) {code.push(line);continue;}
      const item = line.match(/^\s*(?:([-*])|\d+[.)])\s+(.+)$/);
      if(item) {const kind=item[1]?'ul':'ol';if(list!==kind){closeList();html+='<'+kind+'>';list=kind;}html+='<li>'+inline(item[2])+'</li>';continue;}
      closeList();
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      if(heading) html += '<h4>'+inline(heading[1])+'</h4>';
      else if(line.trim()) html += '<p>'+inline(line)+'</p>';
    }
    closeList(); if(code!==null) html+='<pre><code>'+escape(code.join('\n'))+'</code></pre>';
    return html.replace(/\u0000(\d+)\u0000/g, (_,i)=>tokens[Number(i)]);
  }

  // Serialize each key, retain failed writes, and never clear a newer edit's pending flag.
  function createSync({storage, write, status}) {
    let pending={};try{pending=JSON.parse(storage.getItem('lab_pending_writes')||'{}');}catch{}
    let running=false, revision=Date.now(), storageFailed=false;
    const persist=()=>{try{storage.setItem('lab_pending_writes',JSON.stringify(pending));storageFailed=false;return true;}catch{storageFailed=true;status('error','Browser storage is full. Export a backup before closing.');return false;}};
    async function flush(){
      if(running)return;running=true;
      let failed=false;
      try{
        const attempted=new Set();
        let key;
        while((key=Object.keys(pending).find(candidate=>!attempted.has(candidate)))){
          attempted.add(key);
          while(pending[key]){
            const entry=pending[key];status('saving','Saving to cloud…');
            try{await write(key,entry.value);}catch{failed=true;break;}
            if(pending[key]?.revision===entry.revision){delete pending[key];persist();}
          }
        }
      }finally{running=false;}
      if(storageFailed)status('error','Browser storage is full. Export a backup before closing.');
      else if(failed || Object.keys(pending).length)status('error','Saved on this device · cloud save pending');
      else {const at=new Date().toISOString();try{storage.setItem('lab_cloud_saved_at',at);}catch{}status('saved','Cloud saved · '+new Date(at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));}
    }
    function save(key,value){
      const copy=JSON.parse(JSON.stringify(value));
      pending[key]={revision:++revision,value:copy};
      persist();status('pending','Saved on this device · waiting for cloud');
      return flush();
    }
    return {save,flush,hasPending:()=>Object.keys(pending).length>0,overlay:store=>({...store,...Object.fromEntries(Object.entries(pending).map(([k,v])=>[k,v.value]))})};
  }
  const activityPriorities=['high','normal','low'];
  const activityPriority=item=>activityPriorities.includes(item.priority)?item.priority:'normal';
  const activityIsOpen=item=>!['done','archived'].includes(item.status);
  // Filters concern the activity date. Open work starts across all dates so an
  // unfinished item does not disappear when the calendar turns to a new month.
  function filterActivities(items,{month='',status='open',project=''}={}){
    const query=project.trim().toLowerCase();
    return items.filter(item=>(!month||String(item.date||'').startsWith(month))&&
      (!query||String(item.project||'').toLowerCase().includes(query))&&
      (status==='all'||(status==='done'?item.status==='done':status==='archived'?item.status==='archived':activityIsOpen(item))))
      .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  }
  // Keep older/unknown fields and previous completion/status history on edits.
  // A blank due date is explicitly null, never silently replaced with today.
  function updateActivity(previous,values,at){
    const item={...previous,...values,updatedAt:at};
    item.due=item.due||null;
    item.nextAction=values.nextAction??previous?.nextAction??'';
    item.priority=activityPriority(item);
    if(!previous)item.createdAt=at;
    if(!previous||previous.status!==item.status){
      const history=[...(Array.isArray(previous?.statusHistory)?previous.statusHistory:[])];
      // Older entries may have only completedAt. Retain that evidence before a
      // later completion replaces the latest-completion timestamp.
      if(previous?.completedAt&&!history.some(entry=>entry?.status==='done'&&entry.at===previous.completedAt))history.push({status:'done',at:previous.completedAt});
      item.statusHistory=[...history,{status:item.status,at}];
    }
    if(item.status==='done')item.completedAt=previous?.status==='done'&&previous.completedAt?previous.completedAt:at;
    else item.completedAt=previous?.completedAt||null;
    return item;
  }
  function context(notes,activities){
    const pinned=notes.filter(n=>!n.archived).map(n=>`[${n.project} — ${n.title}; updated ${n.updatedAt?.slice(0,10)}]\n${n.body}`).join('\n\n');
    const ordered=[...activities].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const open=ordered.filter(a=>a.status!=='done'&&a.status!=='archived').slice(0,50);
    const recent=ordered.filter(a=>a.status==='done').slice(0,20);
    const rows=[...open,...recent].map(a=>`[${a.date||'Date not recorded'}] ${a.project}: ${a.title} | ${a.status||'open'} | Priority: ${activityPriority(a)} | Owner: ${a.owner||'Unassigned'} | Due: ${a.due||'Not set'} | Next action: ${a.nextAction||'Not set'}\n${a.details||''}`).join('\n');
    return '\n\nPINNED PROJECT NOTES (persistent reference; dates matter):\n'+(pinned||'None')+'\n\nACTIVITY AND FOLLOW-UPS (up to 50 open and 20 recent completed entries; not billing records):\n'+(rows||'None');
  }
  root.LabWorkspaceCore={markdown,createSync,context,filterActivities,updateActivity};
  if(typeof document==='undefined')return;
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
  let notes=read('lab_project_notes',[]), activities=read('lab_activity',[]);
  const $=id=>document.getElementById(id);
  const today=()=>{const date=new Date();return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');};
  const style=document.createElement('style');
  style.textContent=`
    #workspace-save-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:8px 24px;background:var(--surface);border-bottom:1px solid var(--border);font-size:12px;color:var(--text-mid)}
    #workspace-save-bar[data-state=error]{color:#ffb780}#workspace-save-bar[data-state=saved]{color:var(--success)}
    .ws-wrap{max-width:1200px;margin:auto;padding:24px}.ws-wrap h2{font-size:24px;margin-bottom:8px}.ws-muted{color:var(--text-mid);font-size:13px;line-height:1.6}
    .ws-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:20px 0}.ws-toolbar label{font-size:12px;display:flex;gap:8px;align-items:center}
    .ws-btn{border:1px solid var(--teal-mid);background:var(--teal-dim);color:var(--text);border-radius:7px;padding:9px 14px;cursor:pointer;font:inherit}.ws-btn:focus-visible,.ws-wrap input:focus-visible,.ws-wrap textarea:focus-visible,.ws-wrap select:focus-visible{outline:2px solid var(--teal);outline-offset:3px}
    .ws-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}.ws-card,.ws-editor{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px}.ws-card h3{margin:8px 0;font-size:16px}.ws-card p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;font-size:13px}.ws-card footer{margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ws-tag{font-size:11px;color:var(--teal);text-transform:uppercase;letter-spacing:.06em}.ws-overdue{color:#ffb780}.ws-editor{margin-bottom:20px}.ws-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.ws-editor label{display:block;font-size:12px;margin:10px 0}.ws-editor input,.ws-editor select,.ws-editor textarea,.ws-toolbar input,.ws-toolbar select{box-sizing:border-box;max-width:100%;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:10px;font:inherit}.ws-editor input,.ws-editor select,.ws-editor textarea{width:100%;margin-top:6px}.ws-editor textarea{min-height:130px;resize:vertical}.ws-editor[hidden]{display:none}.ws-empty{padding:36px;border:1px dashed var(--border);border-radius:12px;color:var(--text-mid)}
    .msg-bubble h4{font-size:1rem;margin:12px 0 8px}.msg-bubble ul,.msg-bubble ol{padding-left:22px;margin:8px 0}.msg-bubble li{margin:6px 0}.msg-bubble pre{overflow:auto;padding:12px;background:var(--surface2);border-radius:8px;white-space:pre}.msg-bubble a{color:var(--teal);text-decoration:underline}.msg-bubble pre code{padding:0}
    @media(max-width:600px){.ws-wrap{padding:14px}#workspace-save-bar{padding:8px 14px}.ws-toolbar>*{max-width:100%}}
  `;
  document.head.appendChild(style);
  const bar=document.createElement('div');bar.id='workspace-save-bar';bar.innerHTML='<span id="workspace-save-text" role="status" aria-live="polite">Cloud not checked yet</span><button class="ws-btn" id="workspace-retry" type="button">Retry cloud save</button>';
  document.querySelector('.topnav').after(bar);
  const status=(state,text)=>{bar.dataset.state=state;$('workspace-save-text').textContent=text;$('workspace-retry').hidden=!['error','pending'].includes(state);};
  async function cloud(body){
    const response=await fetch('/.netlify/functions/lab-store',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Access-Code':labAccessCode},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok||!result.ok)throw new Error('Cloud request failed');return result;
  }
  const sync=createSync({storage:localStorage,status,write:async(key,value)=>{
    const result=await cloud({action:'save',key,value});
    if(result.key!==key)throw new Error('Cloud save not confirmed');
  }});
  SB.save=sync.save;SB._sbSaveRaw=sync.save;
  $('workspace-retry').onclick=()=>sync.flush();
  window.addEventListener('online',()=>{if(sync.hasPending())sync.flush();});
  window.addEventListener('beforeunload',event=>{if(sync.hasPending()){event.preventDefault();event.returnValue='';}});
  const originalLoad=SB.load.bind(SB);
  let cloudLoaded=false,remoteKeys=new Set();
  SB.load=async()=>{
    status('saving','Checking cloud…');
    let result;
    try{result=await cloud({action:'load'});}catch{status('error','Cloud unavailable · using this device’s copy');return null;}
    remoteKeys=new Set(Object.keys(result.data));cloudLoaded=true;
    // Read legacy data only for the initial migration; do not delete or alter it.
    const legacy=remoteKeys.has('records')?{}:(await originalLoad()||{});
    const store={...legacy,...result.data};SB._cloudLast=result.updatedAt||SB._cloudLast;
    const merged=sync.overlay(store);
    if(Array.isArray(merged.project_notes)){notes=merged.project_notes;localStorage.setItem('lab_project_notes',JSON.stringify(notes));}
    if(Array.isArray(merged.activity)){activities=merged.activity;localStorage.setItem('lab_activity',JSON.stringify(activities));}
    status(sync.hasPending()?'pending':'saved',sync.hasPending()?'Local changes waiting for cloud':'Cloud loaded · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
    return merged;
  };
  const oldGuard=cloudVsLocalGuard;
  cloudVsLocalGuard=store=>sync.hasPending()?true:oldGuard(store);
  const oldPush=pushLocalToCloud;
  pushLocalToCloud=()=>{oldPush();SB.save('project_notes',notes);SB.save('activity',activities);};
  const oldContext=buildMemoryContext;
  buildMemoryContext=()=>context(notes,activities)+oldContext();
  const oldInit=initApp;
  initApp=()=>{
    oldInit();renderNotes();renderActivity();
    if(cloudLoaded){
      const pairs={records:'lab_records',pipeline:'lab_pipeline',clients:'lab_clients',leads:'lab_leads',proof:'lab_proof_v2',swipe:'lab_swipe_file',settings:'lab_settings',saved_chats:'lab_saved_chats',memory_summaries:'lab_memory_summaries',project_notes:'lab_project_notes',activity:'lab_activity'};
      for(const [key,localKey] of Object.entries(pairs)){const value=read(localKey,null);if(!remoteKeys.has(key)&&value!==null)SB.save(key,value);}
    }
    if(sync.hasPending())sync.flush();
  };

  function mount(id,label,html){
    const button=document.createElement('button');button.className='nav-tab';button.textContent=label;button.onclick=()=>switchPanel(id,button);document.querySelector('.nav-tabs').appendChild(button);
    const panel=document.createElement('div');panel.id='panel-'+id;panel.className='panel';panel.innerHTML=html;document.querySelector('#app .content').appendChild(panel);
  }
  mount('project-notes','Project Notes',`<div class="ws-wrap"><h2>Project notes</h2><p class="ws-muted">Active notes stay in AI context across conversations. Keep confirmed facts and decisions here; archive notes when they are no longer current.</p><div class="ws-toolbar"><button class="ws-btn" id="ws-add-note">Add project note</button><label>Show archived <input type="checkbox" id="ws-show-archived"></label></div><form id="ws-note-form" class="ws-editor" hidden><input type="hidden" id="ws-note-id"><div class="ws-fields"><label>Project<input id="ws-note-project" required maxlength="100"></label><label>Note title<input id="ws-note-title" required maxlength="150"></label></div><label>Confirmed facts and decisions<textarea id="ws-note-body" required maxlength="6000"></textarea></label><p class="ws-muted">Include the source and date. Active notes have a combined 30,000-character limit.</p><button class="ws-btn" type="submit">Save project note</button> <button class="ws-btn" type="button" id="ws-note-cancel">Cancel</button></form><div id="ws-note-list" class="ws-grid"></div></div>`);
  mount('activity','Activity',`<div class="ws-wrap"><h2>Activity & follow-ups</h2><p class="ws-muted">A dated record of work and next actions. Track completion separately from sales and payments.</p><div class="ws-toolbar"><button class="ws-btn" id="ws-add-activity">Add activity</button><label>Activity month<input id="ws-month" type="month" aria-describedby="ws-activity-filter-help"></label><label>Status<select id="ws-status-filter"><option value="open">Open follow-ups</option><option value="all">All statuses</option><option value="done">Completed</option><option value="archived">Archived</option></select></label><label>Project<input id="ws-project-filter" placeholder="All projects"></label><button class="ws-btn" id="ws-all-dates">All dates</button><button class="ws-btn" id="ws-open-work">Reset to open work</button></div><p id="ws-activity-filter-help" class="ws-muted">Open follow-ups start across all dates, newest activity first. Activity month filters when the work was recorded, not its due date. Choose Completed or All statuses to review past work.</p><p id="ws-activity-count" class="ws-muted" role="status" aria-live="polite"></p><form id="ws-activity-form" class="ws-editor" hidden><input type="hidden" id="ws-activity-id"><div class="ws-fields"><label>Project<input id="ws-activity-project" required maxlength="100"></label><label>Activity title<input id="ws-activity-title" required maxlength="150"></label><label>Activity date<input id="ws-activity-date" type="date" required></label><label>Owner<input id="ws-activity-owner" maxlength="100" placeholder="Unassigned"></label><label>Priority<select id="ws-activity-priority"><option value="high">High</option><option value="normal" selected>Normal</option><option value="low">Low</option></select></label><label>Due date (optional)<input id="ws-activity-due" type="date"></label><label>Status<select id="ws-activity-status"><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="done">Completed</option><option value="archived">Archived</option></select></label></div><label>Next action<input id="ws-activity-nextAction" maxlength="1000" placeholder="The next concrete step"></label><label>Details and evidence<textarea id="ws-activity-details" maxlength="2000"></textarea></label><p class="ws-muted">Leave the due date empty when no deadline is confirmed. Earlier details stay available when adding a next action.</p><button class="ws-btn" type="submit">Save activity</button> <button class="ws-btn" type="button" id="ws-activity-cancel">Cancel</button></form><div id="ws-activity-list" class="ws-grid"></div></div>`);
  const save=(key,value)=>{try{localStorage.setItem('lab_'+key,JSON.stringify(value));SB.save(key,value);return true;}catch{status('error','Could not save on this device. Export a backup before closing.');return false;}};
  const uid=()=>crypto.randomUUID();
  const activeSize=items=>items.filter(n=>!n.archived).reduce((n,item)=>n+item.body.length+item.title.length+item.project.length,0);
  function editNote(id){const note=notes.find(n=>n.id===id)||{};['id','project','title','body'].forEach(key=>$('ws-note-'+key).value=note[key]||'');$('ws-note-form').hidden=false;$('ws-note-project').focus();}
  function renderNotes(){
    const visible=notes.filter(n=>$('ws-show-archived').checked||!n.archived);
    $('ws-note-list').innerHTML=visible.length?visible.map(n=>`<article class="ws-card"><span class="ws-tag">${escape(n.project)} · ${n.archived?'Archived':'In AI context'}</span><h3>${escape(n.title)}</h3><p>${escape(n.body)}</p><footer><span class="ws-muted">Updated ${escape(n.updatedAt?.slice(0,10)||'Unknown')}</span><button class="ws-btn" data-edit-note="${escape(n.id)}">Edit note</button><button class="ws-btn" data-archive-note="${escape(n.id)}">${n.archived?'Restore note':'Archive note'}</button></footer></article>`).join(''):'<div class="ws-empty">No project notes yet. Add a dated note to keep it in the AI’s context.</div>';
  }
  $('ws-add-note').onclick=()=>editNote();$('ws-note-cancel').onclick=()=>$('ws-note-form').hidden=true;$('ws-show-archived').onchange=renderNotes;
  $('ws-note-form').onsubmit=event=>{event.preventDefault();const id=$('ws-note-id').value||uid();const old=notes.find(n=>n.id===id);const note={id,project:$('ws-note-project').value.trim(),title:$('ws-note-title').value.trim(),body:$('ws-note-body').value.trim(),archived:old?.archived||false,updatedAt:new Date().toISOString()};if(!note.project||!note.title||!note.body)return;const next=[note,...notes.filter(n=>n.id!==id)];if(activeSize(next)>30000){alert('Active notes exceed 30,000 characters. Shorten or archive an older note first.');return;}if(save('project_notes',next)){notes=next;$('ws-note-form').hidden=true;renderNotes();}};
  $('ws-note-list').onclick=event=>{const edit=event.target.closest('[data-edit-note]');if(edit){editNote(edit.dataset.editNote);return;}const archive=event.target.closest('[data-archive-note]');if(!archive)return;const next=notes.map(n=>n.id===archive.dataset.archiveNote?{...n,archived:!n.archived,updatedAt:new Date().toISOString()}:n);if(activeSize(next)>30000){alert('Shorten or archive another note before restoring this one.');return;}if(save('project_notes',next)){notes=next;renderNotes();}};
  function editActivity(id){
    const activity=activities.find(a=>a.id===id)||{id:uid(),date:today(),status:'open'};
    ['id','project','title','date','owner','due','status','details','nextAction'].forEach(key=>$('ws-activity-'+key).value=activity[key]||'');
    $('ws-activity-priority').value=activityPriority(activity);
    $('ws-activity-form').hidden=false;$('ws-activity-project').focus();
  }
  function closeActivity(){const form=$('ws-activity-form');form.hidden=true;form.reset();}
  function renderActivity(){
    const month=$('ws-month').value,filter=$('ws-status-filter').value,project=$('ws-project-filter').value;
    const visible=filterActivities(activities,{month,status:filter,project});
    const overdue=items=>items.filter(a=>a.due&&a.due<today()&&activityIsOpen(a)).length;
    const scope=month?'activity month '+month:'all activity dates';
    $('ws-activity-count').textContent=`${visible.length} entries shown · ${scope}${project.trim()?' · project contains “'+project.trim()+'”':''} · ${overdue(visible)} overdue shown (${overdue(activities)} across all projects and dates)`;
    $('ws-activity-list').innerHTML=visible.length?visible.map(a=>`<article class="ws-card"><span class="ws-tag">${escape(a.project)} · ${escape(a.date||'Date not recorded')} · ${escape(String(a.status||'open').replace('_',' '))} · ${escape(activityPriority(a))} priority</span><h3>${escape(a.title)}</h3><p><strong>Next action:</strong> ${escape(a.nextAction||'Not set')}</p><p>${escape(a.details)}</p><p class="ws-muted">Owner: ${escape(a.owner||'Unassigned')}<br><span class="${a.due&&a.due<today()&&activityIsOpen(a)?'ws-overdue':''}">Due: ${escape(a.due||'Not set')}</span>${a.completedAt?'<br>'+(a.status==='done'?'Completed: ':'Last completed: ')+escape(a.completedAt.slice(0,10)):''}</p><footer><button class="ws-btn" data-edit-activity="${escape(a.id)}">Edit activity</button>${activityIsOpen(a)?'<button class="ws-btn" data-complete-activity="'+escape(a.id)+'">Mark complete</button>':''}</footer></article>`).join(''):'<div class="ws-empty">No activity matches these filters. Use All dates or Reset to open work to broaden the view.</div>';
  }
  $('ws-month').value='';$('ws-status-filter').value='open';
  ['ws-month','ws-status-filter','ws-project-filter'].forEach(id=>$(id).oninput=renderActivity);
  $('ws-all-dates').onclick=()=>{$('ws-month').value='';renderActivity();};
  $('ws-open-work').onclick=()=>{$('ws-month').value='';$('ws-status-filter').value='open';$('ws-project-filter').value='';renderActivity();};
  $('ws-add-activity').onclick=()=>editActivity();$('ws-activity-cancel').onclick=closeActivity;
  let activitySubmitting=false;
  $('ws-activity-form').onsubmit=event=>{
    event.preventDefault();const form=$('ws-activity-form');
    // A successful save or Cancel closes the draft. Late/repeated submits must
    // not create another record or mutate a dismissed draft.
    if(form.hidden||activitySubmitting)return;
    activitySubmitting=true;
    try{
      const values={id:$('ws-activity-id').value||uid()};
      $('ws-activity-id').value=values.id;
      ['project','title','date','owner','due','status','details','nextAction','priority'].forEach(key=>values[key]=$('ws-activity-'+key).value.trim());
      if(!values.project||!values.title||!values.date)return;
      const old=activities.find(a=>a.id===values.id),item=updateActivity(old,values,new Date().toISOString());
      const next=[item,...activities.filter(a=>a.id!==item.id)];
      if(save('activity',next)){activities=next;closeActivity();renderActivity();}
    }finally{activitySubmitting=false;}
  };
  $('ws-activity-list').onclick=event=>{
    const edit=event.target.closest('[data-edit-activity]');if(edit){editActivity(edit.dataset.editActivity);return;}
    const complete=event.target.closest('[data-complete-activity]');if(!complete)return;
    const old=activities.find(a=>a.id===complete.dataset.completeActivity);
    if(!old||!activityIsOpen(old))return;
    const item=updateActivity(old,{...old,status:'done'},new Date().toISOString());
    const next=activities.map(a=>a.id===item.id?item:a);
    if(save('activity',next)){activities=next;renderActivity();}
  };
  root.LabWorkspace={snapshot:()=>({project_notes:notes,activity:activities}),restore:data=>{if(Array.isArray(data.project_notes)){notes=data.project_notes;save('project_notes',notes);}if(Array.isArray(data.activity)){activities=data.activity;save('activity',activities);}renderNotes();renderActivity();}};
})(typeof window==='undefined'?globalThis:window);
