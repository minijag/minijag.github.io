import test from 'node:test';
import assert from 'node:assert/strict';
import {findSlots,busyFor,people,localBusy} from './availability.mjs';
test('four friends first share tomorrow 6–8 PM',()=>{
  assert.deepEqual(findSlots(people.map(p=>p.id))[0],{day:1,start:18,end:20});
});
test('every proposed slot is within the window and clear for everyone',()=>{
  for(const duration of [.5,1,2,3]) for(const ids of [['you'],people.map(p=>p.id)]) {
    for(const slot of findSlots(ids,{start:16,end:22,duration})) {
      assert.ok(slot.start>=16 && slot.end<=22);
      assert.equal(slot.end-slot.start,duration);
      for(const id of ids) for(const [a,b] of busyFor(id,slot.day)) assert.ok(slot.end<=a || slot.start>=b);
    }
  }
});
test('empty group and inverted windows do not produce results',()=>{
  assert.deepEqual(findSlots([]),[]);
  assert.deepEqual(findSlots(['you'],{start:21,end:17}),[]);
});
test('real busy intervals override sample data and preserve exact event boundaries',()=>{
  const day=new Date(2026,9,2);
  const at=(hour,minute=0)=>new Date(2026,9,2,hour,minute).toISOString();
  const readBusy=()=>localBusy([{start:at(16),end:at(18,15)}],day);
  assert.deepEqual(findSlots(['you'],{days:1,readBusy})[0],{day:0,start:18.25,end:20.25});
});
test('all-day and overnight intervals are clipped to the local day',()=>{
  const day=new Date(2026,9,2);
  const blocks=localBusy([{start:new Date(2026,9,1,20).toISOString(),end:new Date(2026,9,3,0).toISOString()}],day);
  assert.deepEqual(blocks,[[0,24]]);
  assert.deepEqual(findSlots(['you'],{days:1,readBusy:()=>blocks}),[]);
});
