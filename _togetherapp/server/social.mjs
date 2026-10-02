import {randomBytes,createHash} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
export const problem=(message,status=400)=>Object.assign(new Error(message),{status});
export const publicUser=user=>({id:user.id,name:user.name,connected:Boolean(user.tokens)});
export function socialService(store,webUrl,now=()=>Date.now()){
  const userKey=id=>'user_'+id;
  function requireUser(user){if(!user)throw problem('Sign in first.',401);return user;}
  return {
    async friends(id){const me=requireUser(await store.get(userKey(id)));const friends=await Promise.all(me.friends.map(other=>store.get(userKey(other))));return friends.filter(Boolean).map(publicUser);},
    async invite(id){const token=secret(),hash=digest(token);await store.transaction(async tx=>{
      const me=requireUser(await tx.get(userKey(id)));
      if(!me.tokens)throw problem('Connect your calendar before inviting a friend.');
      if(me.invites?.filter(i=>i.expires>now()).length>=20)throw problem('Revoke an unused invitation before creating another.',429);
      const expires=now()+7*86400000;
      tx.set('invite_'+hash,{owner:id,expires,usedBy:null});
      tx.set(userKey(id),{...me,invites:[...(me.invites||[]).filter(i=>i.expires>now()),{id:hash,expires}]});
    });return {id:hash,url:webUrl+'#invite='+token,expires:now()+7*86400000};},
    async invitations(id){const me=requireUser(await store.get(userKey(id)));const active=[];for(const ref of me.invites||[]){const invite=await store.get('invite_'+ref.id);if(invite&&!invite.usedBy&&invite.expires>now())active.push({id:ref.id,expires:invite.expires});}return active;},
    async preview(token){if(!/^[\w-]{43}$/.test(token||''))throw problem('This invitation is invalid.',404);const invite=await store.get('invite_'+digest(token));if(!invite||invite.expires<=now()||invite.revoked||invite.usedBy)throw problem('This invitation expired or has already been accepted.',410);const owner=await store.get(userKey(invite.owner));if(!owner)throw problem('This invitation is unavailable.',410);return {name:owner.name,expires:invite.expires};},
    async accept(id,token){if(!/^[\w-]{43}$/.test(token||''))throw problem('Invalid invitation.');return store.transaction(async tx=>{
      const key='invite_'+digest(token),invite=await tx.get(key);
      if(!invite||invite.revoked||invite.expires<=now())throw problem('This invitation expired or was revoked.',410);
      if(invite.owner===id)throw problem('This is your own invitation. Send it to a friend.');
      if(invite.usedBy&&invite.usedBy!==id)throw problem('This invitation has already been accepted.',410);
      const [me,owner]=await Promise.all([tx.get(userKey(id)),tx.get(userKey(invite.owner))]);
      requireUser(me);requireUser(owner);
      if(!me.tokens)throw problem('Connect your calendar before accepting.');
      if(invite.usedBy===id&&!me.friends.includes(owner.id))throw problem('This invitation has already been used.',410);
      if(me.friends.length>=100||owner.friends.length>=100)throw problem('The friend limit has been reached.');
      tx.set(userKey(id),{...me,friends:[...new Set([...me.friends,owner.id])]});
      tx.set(userKey(owner.id),{...owner,friends:[...new Set([...owner.friends,id])]});
      tx.set(key,{...invite,usedBy:id});return publicUser(owner);
    });},
    async revoke(id,hash){if(!/^[a-f0-9]{64}$/.test(hash||''))throw problem('Invalid invitation.');await store.transaction(async tx=>{const key='invite_'+hash,invite=await tx.get(key),me=await tx.get(userKey(id));if(!invite||invite.owner!==id)throw problem('Invitation not found.',404);tx.set(key,{...invite,revoked:true});tx.set(userKey(id),{...me,invites:(me.invites||[]).filter(i=>i.id!==hash)});});},
    async remove(id,other){await store.transaction(async tx=>{const [me,friend]=await Promise.all([tx.get(userKey(id)),tx.get(userKey(other))]);requireUser(me);if(!me.friends.includes(other))throw problem('Friend not found.',404);tx.set(userKey(id),{...me,friends:me.friends.filter(i=>i!==other)});if(friend)tx.set(userKey(other),{...friend,friends:friend.friends.filter(i=>i!==id)});});},
    async authorize(id,requested){const me=requireUser(await store.get(userKey(id)));if(!Array.isArray(requested)||!requested.length||requested.length>20||!requested.includes(id))throw problem('Choose yourself and up to 19 friends.');const ids=[...new Set(requested)];if(ids.some(other=>other!==id&&!me.friends.includes(other)))throw problem('You can only view accepted friends’ availability.',403);return Promise.all(ids.map(async other=>{const user=await store.get(userKey(other));if(!user||(other!==id&&!user.friends.includes(id)))throw problem('Friendship is no longer active.',403);return user;}));}
  };
}
