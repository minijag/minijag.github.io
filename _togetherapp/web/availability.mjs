export const people = [
  { id:'you', name:'You', initials:'ME', color:'#47705b', pale:'#e5ece5' },
  { id:'alex', name:'Alex', initials:'AL', color:'#ba8355', pale:'#f3e7dc' },
  { id:'sam', name:'Sam', initials:'SA', color:'#8476ac', pale:'#eae5f2' },
  { id:'jordan', name:'Jordan', initials:'JO', color:'#5d87a0', pale:'#e3ecf2' }
];
// Explicitly synthetic schedules, expressed as local hours on relative days.
export function busyFor(person, day) {
  const schedules = {
    you: [[[17,19]], [[17,18]], [[19,21]], [], [[17,18.5]], [[18,20]], []],
    alex: [[[19,21]], [[20,21]], [[17,19]], [[17,18]], [], [[17,19]], [[19,21]]],
    sam: [[[18,20]], [[17,18]], [[18,20]], [[20,21]], [[19,21]], [], [[17,18]]],
    jordan: [[[17,18]], [[20,21]], [[20,21]], [[17,18]], [[17,19]], [[20,21]], []]
  };
  return schedules[person]?.[day % 7] || [];
}
export function findSlots(ids, {start=17,end=21,duration=2,days=14,readBusy=busyFor} = {}) {
  if (!ids.length || start >= end || duration <= 0) return [];
  const result=[];
  for(let day=0;day<days;day++) {
    const blocks=ids.flatMap(id=>readBusy(id,day)).sort((a,b)=>a[0]-b[0]);
    let cursor=start;
    for(const [a,b] of blocks) {
      if(b<=cursor || a>=end) continue;
      if(a-cursor>=duration) result.push({day,start:cursor,end:cursor+duration});
      cursor=Math.max(cursor,b);
    }
    if(end-cursor>=duration) result.push({day,start:cursor,end:cursor+duration});
  }
  return result;
}

export function localBusy(intervals, day) {
  const start=new Date(day);start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+1);
  const hour=date=>date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
  return intervals.flatMap(block=>{
    const a=new Date(block.start),b=new Date(block.end);
    if(a>=end||b<=start) return [];
    return [[a<=start?0:hour(a),b>=end?24:hour(b)]];
  });
}
