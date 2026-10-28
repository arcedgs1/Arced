import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerSettings} from '../scripts/owner-settings.js';
const valid={SETUP_OWNER_EMAIL:'owner@example.test',SETUP_OWNER_PASSWORD:'fictional-password'};
test('names missing or invalid owner settings without printing values',()=>{
 for(const [settings,pattern] of [[{},/EMAIL is missing/],[{...valid,SETUP_OWNER_EMAIL:'invalid-private-value'},/EMAIL is not a valid/],[{SETUP_OWNER_EMAIL:valid.SETUP_OWNER_EMAIL},/PASSWORD is missing/],[{...valid,SETUP_OWNER_PASSWORD:'short'},/fewer than 12/],[{...valid,SETUP_OWNER_PASSWORD:'x'.repeat(201)},/more than 200/]]){
 assert.throws(()=>ownerSettings(settings),e=>pattern.test(e.message)&&!e.message.includes('invalid-private-value')&&!e.message.includes('fictional-password'));
 }
});
test('normalizes only email whitespace and preserves password exactly',()=>{const input={...valid,SETUP_OWNER_EMAIL:' owner@example.test ',SETUP_OWNER_PASSWORD:'  fictional-password  '};assert.deepEqual(ownerSettings(input),{email:'owner@example.test',password:input.SETUP_OWNER_PASSWORD});});
