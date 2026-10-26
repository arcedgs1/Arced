import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForDatabase} from '../scripts/wait-for-database.js';
test('retries refusal until ready',async()=>{let n=0;await waitForDatabase({connect:async()=>{if(++n<3)throw {code:'ECONNREFUSED'};},delay:async()=>{},log:()=>{}});assert.equal(n,3);});
test('bounds retries without leaking errors',async()=>{let n=0;await assert.rejects(waitForDatabase({attempts:2,connect:async()=>{n++;throw {code:'ECONNREFUSED',message:'private password'};},delay:async()=>{},log:()=>{}}),e=>e.message.includes('still unavailable')&&!e.message.includes('private password'));assert.equal(n,2);});
test('does not retry authentication failure',async()=>{let n=0;await assert.rejects(waitForDatabase({connect:async()=>{n++;throw {code:'28P01'};},delay:async()=>assert.fail(),log:()=>{}}));assert.equal(n,1);});
