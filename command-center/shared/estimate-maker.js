// Quantities are thousandths, money is cents, percentages are basis points.
export const categories=['materials','labor','subcontractors','disposal','equipment','permits','other'];
export const actualCategories=[...categories,'overhead','contingency'];
export function decimal(value,places=2){
 const s=String(value);if(!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(s))throw Error(`Use a nonnegative number with at most ${places} decimal places`);
 const [whole,fraction='']=s.split('.');const n=Number(whole)*10**places+Number(fraction.padEnd(places,'0'));
 if(!Number.isSafeInteger(n)||n>100000000000)throw Error('Number is too large');return n;
}
const round=(n,d)=>(n+d/2n)/d;
const safe=n=>{if(n>100000000000n||n<0n)throw Error('Estimate exceeds the supported amount');return Number(n);};
export function calculate(m){
 const totals=Object.fromEntries(categories.map(c=>[c,0]));
 const lines=m.lines.map(l=>{
  if(!categories.includes(l.category))throw Error('Unknown cost category');
  for(const [n,max] of [[l.quantity_milli,100000000],[l.unit_cents,100000000],[l.waste_bps,10000]])if(!Number.isInteger(n)||n<0||n>max)throw Error('Invalid line amount');
  if(!l.quantity_milli)throw Error('Quantity must be positive');
  const amount_cents=safe(round(BigInt(l.quantity_milli)*BigInt(l.unit_cents)*BigInt(10000+l.waste_bps),10000000n));
  totals[l.category]=safe(BigInt(totals[l.category])+BigInt(amount_cents));return {...l,amount_cents};
 });
 for(const n of [m.overhead_bps,m.contingency_bps,m.profit_bps,m.tax_bps])if(!Number.isInteger(n)||n<0||n>10000)throw Error('Invalid percentage');
 if(!['markup','margin'].includes(m.profit_mode)||m.profit_mode==='margin'&&m.profit_bps>=10000)throw Error('Profit margin must be below 100%');
 const direct_cents=safe(Object.values(totals).reduce((s,n)=>s+BigInt(n),0n));
 const overhead_cents=safe(round(BigInt(direct_cents)*BigInt(m.overhead_bps),10000n));
 const contingency_cents=safe(round(BigInt(direct_cents+overhead_cents)*BigInt(m.contingency_bps),10000n));
 const cost_cents=safe(BigInt(direct_cents)+BigInt(overhead_cents)+BigInt(contingency_cents));
 const profit_cents=safe(round(BigInt(cost_cents)*BigInt(m.profit_bps),BigInt(m.profit_mode==='margin'?10000-m.profit_bps:10000)));
 const subtotal_cents=safe(BigInt(cost_cents)+BigInt(profit_cents));
 const tax_cents=safe(round(BigInt(subtotal_cents)*BigInt(m.tax_bps),10000n));
 return {lines,totals,direct_cents,overhead_cents,contingency_cents,cost_cents,profit_cents,subtotal_cents,tax_cents,total_cents:safe(BigInt(subtotal_cents)+BigInt(tax_cents))};
}
export function priceStatus(source,now=new Date()){
 if(!source?.url||!source?.checked_on)return 'Unverified';
 const age=(Date.parse(now.toISOString().slice(0,10))-Date.parse(source.checked_on))/86400000;
 return age<0?'Invalid date':age>7?'Recheck price':'Source recorded';
}
export function costComparison(m,expenses){
 const c=calculate(m),estimated={...c.totals,overhead:c.overhead_cents,contingency:c.contingency_cents};
 return actualCategories.map(category=>{
  const actual_cents=expenses.filter(e=>e.category===category).reduce((s,e)=>s+Number(e.amount_cents),0);
  return {category,estimated_cents:estimated[category],actual_cents,variance_cents:estimated[category]-actual_cents};
 });
}
export function customerItems(title,m,c=calculate(m)){
 return [{description:m.customer_description||title,quantity:1,unit_cents:c.subtotal_cents},...(c.tax_cents?[{description:'Sales tax (configured rate)',quantity:1,unit_cents:c.tax_cents}]:[])];
}
