/* Lab-only record editing. No Design Fusion order, invoice, or payment access. */
(function(root){
  'use strict';
  function editDetails(record, fields, at) {
    if(!fields.name.trim()) throw Error('Enter a name.');
    const next={...record,name:fields.name.trim(),notes:fields.notes.trim(),nextAction:fields.nextAction.trim(),nextActionDate:fields.nextActionDate||null,priority:['high','normal','low'].includes(fields.priority)?fields.priority:'normal'};
    if(['name','notes','nextAction','nextActionDate','priority'].every(key=>(record[key]??(key==='priority'?'normal':key==='nextActionDate'?null:''))===next[key]))return record;
    return {...next,updatedAt:at,detailHistory:[...(record.detailHistory||[]),{at,previous:{name:record.name,notes:record.notes,nextAction:record.nextAction,nextActionDate:record.nextActionDate??null,priority:record.priority||'normal'}}]};
  }
  root.LabPipelineCore={editDetails};
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id);
  const panel=$('panel-pipeline'),form=document.createElement('form');
  form.id='lab-record-editor';form.className='ws-editor';form.hidden=true;
  form.innerHTML=`<h3>Edit pipeline details</h3><p class="ws-muted">Updates the Lab record. Sales stage, value, payments, and status history stay as recorded.</p><div class="ws-fields"><label>Name<input id="lp-name" required maxlength="150"></label><label>Priority<select id="lp-priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label>Follow-up due (optional)<input id="lp-nextActionDate" type="date"></label></div><label>Description<textarea id="lp-notes" maxlength="6000"></textarea></label><label>Next action<input id="lp-nextAction" maxlength="1000"></label><p id="lp-error" role="alert"></p><button class="ws-btn" type="submit">Save details</button> <button class="ws-btn" id="lp-cancel" type="button">Cancel</button>`;
  panel.insertBefore(form,$('pipeline-totals'));
  let editing=null;
  const close=()=>{editing=null;form.hidden=true;form.reset();$('lp-error').textContent='';};
  panel.addEventListener('click',event=>{
    const lose=event.target.closest('[data-lab-lose-record]');
    if(lose){const record=getRecord(lose.dataset.labLoseRecord);if(record&&confirm('Mark '+record.name+' as lost?'))setStatus(record.id,'lost');return;}
    const button=event.target.closest('[data-lab-edit-record]');if(!button)return;
    const record=getRecord(button.dataset.labEditRecord);if(!record)return;
    editing=record.id;['name','notes','nextAction','nextActionDate','priority'].forEach(key=>$('lp-'+key).value=record[key]||(key==='priority'?'normal':''));$('lp-error').textContent='';form.hidden=false;$('lp-name').focus();
  });
  $('lp-cancel').onclick=close;
  form.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  form.onsubmit=event=>{
    event.preventDefault();if(!editing||form.hidden)return;
    const current=getRecord(editing);if(!current){$('lp-error').textContent='This record is no longer available. Cancel and reload.';return;}
    const fields=Object.fromEntries(['name','notes','nextAction','nextActionDate','priority'].map(key=>[key,$('lp-'+key).value]));
    try{
      const next=editDetails(current,fields,new Date().toISOString());
      if(next!==current){
        const records=RECORDS.map(record=>record.id===editing?next:record);
        // Do not change in-memory data until this device has accepted the write.
        localStorage.setItem('lab_records',JSON.stringify(records));RECORDS=records;SB.save('records',records);
      }
      close();renderPipeline();renderToday();renderClients();updateClientStats();
    }catch(error){$('lp-error').textContent='Could not save details. '+error.message;}
  };
})(typeof window==='undefined'?globalThis:window);
