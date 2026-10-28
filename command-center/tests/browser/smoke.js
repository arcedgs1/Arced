import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
const run=Date.now();
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:3000');await page.getByLabel('Email',{exact:true}).fill(process.env.SEED_EMAIL);await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_PASSWORD);await page.getByRole('button',{name:'Sign in →'}).click();await page.getByRole('heading',{name:'Today, in focus.'}).waitFor();
await page.locator('nav [data-page="Leads"]').click();await page.getByRole('button',{name:'＋ Add lead',exact:true}).click();
const dialog=page.getByRole('dialog');await dialog.getByLabel('Client or business name').fill(`Browser demo ${viewport.width} ${run}`);await dialog.getByLabel('What work is needed?').fill('Fictional browser test inquiry');await dialog.getByRole('button',{name:'Save',exact:true}).click();await page.getByText(`Browser demo ${viewport.width} ${run}`,{exact:true}).waitFor();
await page.locator('nav [data-page="Estimates"]').click();await page.getByRole('button',{name:'＋ Create estimate',exact:true}).click();await dialog.getByLabel('Estimate title',{exact:true}).fill(`Browser estimate ${viewport.width} ${run}`);await dialog.getByLabel('Description / specification').fill('Fictional repair');await dialog.getByLabel('Unit cost (USD)').fill('125.50');await dialog.getByLabel('Quantity / hours',{exact:true}).fill('2');await dialog.getByRole('button',{name:'Add cost line',exact:true}).click();await dialog.getByLabel('Description / specification').nth(1).fill('Materials');await dialog.getByLabel('Unit cost (USD)').nth(1).fill('30.00');await dialog.getByLabel('Overhead (%)',{exact:true}).fill('0');await dialog.getByLabel('Contingency (%)',{exact:true}).fill('0');await dialog.getByLabel('Profit (%)',{exact:true}).fill('0');await dialog.getByRole('button',{name:'Save draft',exact:true}).click();await dialog.getByRole('button',{name:'Saved customer estimate / print'}).waitFor();await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'hidden'});const estimateRow=page.locator('tr').filter({hasText:`Browser estimate ${viewport.width} ${run}`});await estimateRow.waitFor();assert.ok((await estimateRow.innerText()).includes('$281.00'));
await page.locator('nav [data-page="Today"]').click();
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Page overflows at ${viewport.width}`);
assert.deepEqual(errors,[]);await page.screenshot({path:`/tmp/arced-${viewport.width}.png`,fullPage:true});await page.close();console.log(`PASS browser ${viewport.width}: login, create lead, create estimate, dashboard, no page errors or viewport overflow`);
}
}finally{await browser.close();}
