import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:'America/Los_Angeles'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000');await page.getByLabel('Email',{exact:true}).fill(process.env.SEED_EMAIL);await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_PASSWORD);await page.getByRole('button',{name:'Sign in →'}).click();
  await page.getByRole('button',{name:'Open daily checklist →',exact:true}).click();
  const title=`Daily plan ${width} ${Date.now()}`,dialog=page.getByRole('dialog');
  await page.getByRole('button',{name:'＋ Add task',exact:true}).first().click();
  await dialog.getByLabel('What needs to get done?').fill(title);await dialog.getByLabel('Notes / details').fill('A little task and a big task <img src=x onerror=alert(1)>');await dialog.getByLabel('Priority',{exact:true}).selectOption('urgent');await dialog.getByLabel('Due date (optional)').fill('2020-01-01');await dialog.getByLabel('Smaller steps (one per line)').fill('Call supplier\nBuy supplies');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const row=page.locator('.daily-card').filter({hasText:title});await expect(row).toContainText('Overdue');assert.equal(await row.locator('img').count(),0);
  await row.getByRole('button',{name:`Complete daily task: ${title}`,exact:true}).click();await expect(page.locator('#notice')).toContainText('Finish the smaller steps');
  await row.getByLabel('Call supplier',{exact:true}).check();await expect(row).toContainText('1 of 2 smaller steps done');await row.getByLabel('Buy supplies',{exact:true}).check();await expect(row).toContainText('2 of 2 smaller steps done');
  await row.getByRole('button',{name:`Complete daily task: ${title}`,exact:true}).click();await expect(row).toHaveCount(0);
  await page.locator('[data-checklist-view="Completed"]').click();await expect(row).toContainText('Completed');
  await row.getByRole('button',{name:`Reopen daily task: ${title}`,exact:true}).click();await expect(row).toHaveCount(0);
  await page.locator('[data-checklist-view="All open"]').click();await row.getByRole('button',{name:'Edit',exact:true}).click();await dialog.getByLabel('Due date (optional)').fill('2099-01-01');await dialog.getByLabel('Status',{exact:true}).selectOption('in_progress');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.locator('[data-checklist-view="Upcoming"]').click();await expect(row).toContainText('in progress');
  await page.reload();await page.locator('nav [data-page="Daily Checklist"]').click();await page.locator('[data-checklist-view="Upcoming"]').click();await expect(row).toContainText(title);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.screenshot({path:`/tmp/arced-daily-${width}.png`,fullPage:true});await page.close();console.log(`PASS daily checklist ${width}: create, step guard/completion, history, reopen, edit, future view, persistence and escaping`);
 }
}finally{await browser.close();}
