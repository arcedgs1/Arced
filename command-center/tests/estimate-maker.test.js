import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculate,decimal,priceStatus,costComparison,customerItems} from '../shared/estimate-maker.js';
import {makerSchema,detectEstimateType,extractResearch} from '../server/estimate-maker-routes.js';
const line=(category,unit_cents,quantity_milli=1000,waste_bps=0)=>({category,unit_cents,quantity_milli,waste_bps,description:'Fictional scope',unit:'ea',source:null});
const maker=(lines=[line('materials',10000)])=>({location:'NJ',customer_description:'Agreed scope',internal_notes:'PRIVATE PROFIT NOTES',measurements:[],lines,overhead_bps:1000,contingency_bps:500,profit_bps:2000,profit_mode:'markup',tax_bps:0,price_reviewed:false});
test('fractional labor, material waste and rounding use exact integer cents',()=>{
 const c=calculate(maker([line('materials',1999,1250,1000),line('labor',4500,7500)]));
 assert.equal(c.lines[0].amount_cents,2749);assert.equal(c.totals.labor,33750);assert.equal(c.direct_cents,36499);
 assert.equal(decimal('1.125',3),1125);assert.equal(decimal('19.99'),1999);assert.throws(()=>decimal('1e3'));assert.throws(()=>decimal('1.001'));
});
test('overhead, contingency, markup, margin and sales tax have distinct bases',()=>{
 const m=maker(),c=calculate(m);assert.equal(c.overhead_cents,1000);assert.equal(c.contingency_cents,550);assert.equal(c.cost_cents,11550);assert.equal(c.profit_cents,2310);assert.equal(c.total_cents,13860);
 const margin=calculate({...m,profit_mode:'margin',tax_bps:662});assert.equal(margin.profit_cents,2888);assert.equal(margin.subtotal_cents,14438);assert.equal(margin.tax_cents,956);
 assert.throws(()=>calculate({...m,profit_mode:'margin',profit_bps:10000}));
 assert.throws(()=>calculate({...m,lines:Array(200).fill(line('materials',100000000,100000000,10000))}));
});
test('all direct categories, job overhead and contingency are compared separately',()=>{
 const m=maker(['materials','labor','subcontractors','disposal','equipment','permits','other'].map(c=>line(c,10000)));
 const rows=costComparison(m,[{category:'labor',amount_cents:'11000'},{category:'disposal',amount_cents:'500'},{category:'overhead',amount_cents:'200'}]);
 assert.equal(rows.find(r=>r.category==='labor').variance_cents,-1000);assert.equal(rows.find(r=>r.category==='disposal').actual_cents,500);assert.equal(rows.find(r=>r.category==='overhead').actual_cents,200);
});
test('customer items cannot leak supplier costs, overhead, private notes or profit',()=>{
 const m=maker();m.lines[0].source={supplier:'PRIVATE VENDOR',url:'https://example.com',checked_on:'2026-10-28',location:'NJ',notes:'PRIVATE DISCOUNT'};
 const items=customerItems('Job',m);assert.deepEqual(items,[{description:'Agreed scope',quantity:1,unit_cents:13860}]);assert.ok(!JSON.stringify(items).includes('PRIVATE'));
});
test('source dates and URLs are validated and stale quotes are labeled',()=>{
 const m=maker(),source={supplier:'Supplier',url:'https://example.com/product',checked_on:'2026-10-01',location:'07644'};
 assert.equal(priceStatus(source,new Date('2026-10-28T12:00:00Z')),'Recheck price');assert.equal(priceStatus(null),'Unverified');
 assert.equal(makerSchema.safeParse({...m,lines:[{...m.lines[0],source:{...source,url:'javascript:alert(1)'}}]}).success,false);
 assert.equal(makerSchema.safeParse({...m,lines:[{...m.lines[0],source:{...source,checked_on:'2999-01-01'}}]}).success,false);
});
test('private multimedia checks signatures rather than trusting file extensions',()=>{
 for(const [bytes,type] of [[Buffer.from([137,80,78,71,13,10,26,10]),'image/png'],[Buffer.from('RIFF0000WAVE'),'audio/wav'],[Buffer.from('0000ftypisom'),'video/mp4'],[Buffer.from('OggS0000'),'audio/ogg'],[Buffer.from([26,69,223,163]),'video/webm']])assert.equal(detectEstimateType(bytes)[0],type);
 assert.throws(()=>detectEstimateType(Buffer.from('<script>alert(1)</script>')));
});
test('live research requires a completed search and carries source links',()=>{
 assert.throws(()=>extractResearch({output:[{content:[{type:'output_text',text:'Unsourced $5'}]}]}));
 const r=extractResearch({output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'Price evidence',annotations:[{type:'url_citation',url:'https://example.com/product',title:'Supplier'}]}]}]});assert.equal(r.sources[0].url,'https://example.com/product');assert.equal(r.result,'Price evidence');
});
