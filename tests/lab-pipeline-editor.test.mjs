import test from 'node:test';
import assert from 'node:assert/strict';
import '../lab-pipeline-editor.js';
import '../lab-order-review.js';
const {editDetails}=globalThis.LabPipelineCore;
test('pipeline detail edit preserves identity, finances, sales stage and unknown history',()=>{
 const before={id:'legacy',name:'Legacy Client',notes:'old',status:'proposal',dealValue:500,payments:[{paid:true,amount:100}],statusHistory:[{status:'proposal'}],futureField:{preserve:true}};
 const original=JSON.stringify(before);
 const fields={name:'Renamed Client',notes:'Live website',nextAction:'Confirm next steps',nextActionDate:'',priority:'high'};
 const after=editDetails(before,fields,'2026-10-02');
 assert.equal(JSON.stringify(before),original);assert.equal(after.id,before.id);assert.equal(after.dealValue,500);assert.equal(after.status,'proposal');
 assert.deepEqual(after.payments,before.payments);assert.deepEqual(after.statusHistory,before.statusHistory);assert.deepEqual(after.futureField,before.futureField);
 assert.equal(after.nextActionDate,null);assert.equal(after.detailHistory[0].previous.name,'Legacy Client');
 assert.equal(editDetails(after,fields,'later'),after);
 assert.throws(()=>editDetails(before,{...fields,name:'  '},'now'));
});
test('order review labels candidates without mutating or recalculating source orders',()=>{
 const orders=[{customerName:'Demo Order',status:'New',quoteTotal:'$999'},{customerName:'Real Customer',item:'Contest shirt'},{customerName:'Customer',item:'Sample shirt'}];
 const before=JSON.stringify(orders);const results=globalThis.LabOrderReviewCore.reviewOrders(orders);
 assert.deepEqual(results,[orders[0],orders[2]]);assert.equal(JSON.stringify(orders),before);assert.deepEqual(globalThis.LabOrderReviewCore.reviewOrders(null),[]);
});
