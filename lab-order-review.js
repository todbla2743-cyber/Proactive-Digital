/* Read-only Lab review. No order mutation, billing calculation, or dashboard changes. */
(function(root){
  'use strict';
  function reviewOrders(orders){
    return (Array.isArray(orders)?orders:[]).filter(order=>/\b(test|testing|demo|sample)\b/i.test([order.customerName,order.item,order.service].filter(Boolean).join(' ')));
  }
  root.LabOrderReviewCore={reviewOrders};
  if(typeof document==='undefined')return;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button=document.createElement('button');button.className='nav-tab';button.textContent='Order review';
  const panel=document.createElement('div');panel.id='panel-order-review';panel.className='panel';
  panel.innerHTML='<div class="ws-wrap"><h2>Design Fusion · Lab review</h2><p class="ws-muted">Potential test orders, for review only. A test/demo/sample label can also be a legitimate order. Confirm with Rudy before relying on invoice or revenue totals. This view does not change or exclude any orders from the dashboard or its totals.</p><button class="ws-btn" id="lor-refresh">Review loaded orders</button><p class="ws-muted" id="lor-status" role="status"></p><div class="ws-grid" id="lor-list"></div></div>';
  function render(){
    const loaded=typeof _dfFeedCache!=='undefined'&&Array.isArray(_dfFeedCache);
    const orders=loaded?_dfFeedCache:[],suspects=reviewOrders(orders);
    document.getElementById('lor-status').textContent=loaded?`${suspects.length} possible test orders among ${orders.length} loaded orders. This is a limited feed, not a complete audit.`:'No feed loaded. Open Design Fusion and refresh its existing feed, then return here.';
    document.getElementById('lor-list').innerHTML=suspects.length?suspects.map(order=>`<article class="ws-card"><span class="ws-tag">Needs review · possible test</span><h3>${escape(order.customerName||'Unknown')}</h3><p>${escape(order.item||'')} ${escape(order.service||'')}</p><p class="ws-muted">Recorded status: ${escape(order.status||'New')}<br>Recorded amount: ${escape(order.quoteTotal||order.startingEstimate||'Not set')}</p></article>`).join(''):'<p class="ws-muted">No candidates in the loaded feed. This does not verify that all orders are genuine.</p>';
  }
  document.querySelector('.nav-tabs').appendChild(button);document.querySelector('#app .content').appendChild(panel);
  button.onclick=()=>{switchPanel('order-review',button);render();};document.getElementById('lor-refresh').onclick=render;
})(typeof window==='undefined'?globalThis:window);
