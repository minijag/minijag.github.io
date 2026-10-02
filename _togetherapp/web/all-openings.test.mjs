import test from 'node:test';
import assert from 'node:assert/strict';
import {findSlots,mergeSlots} from './availability.mjs';
test('all start choices in a free evening including the latest fit',()=>{
 assert.deepEqual(findSlots(['me'],{days:1,readBusy:()=>[]}).map(s=>s.start),[17,17.5,18,18.5,19]);
});
test('multiple gaps, overlapping busy calendars, and exact boundaries',()=>{
 const readBusy=id=>id==='me'?[[18,18.5],[18.25,19]]:[[20.25,21]];
 const slots=findSlots(['me','friend'],{days:1,duration:.5,readBusy});
 assert.deepEqual(slots.map(s=>s.start),[17,17.5,19,19.5,19.75]);
 assert.deepEqual(mergeSlots(slots),[{day:0,start:17,end:18},{day:0,start:19,end:20.25}]);
});
test('all two-week options are retained, and unknown calendars block availability',()=>{
 assert.equal(findSlots(['me'],{readBusy:()=>[]}).length,70);
 assert.deepEqual(findSlots(['me','unknown'],{readBusy:id=>id==='unknown'?[[0,24]]:[]}),[]);
});
