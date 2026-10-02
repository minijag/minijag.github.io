import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

export function tokenVault(key) {
  const bytes=Buffer.from(key||'','base64');
  if(bytes.length!==32)throw Error('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return {
    seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',bytes,iv);const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');},
    open(value){const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',bytes,data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8'));}
  };
}

// Serialized, atomic local persistence. Production uses Firestore transactions instead.
export async function localStore(path) {
  let records={};
  if(path)try{records=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  let tail=Promise.resolve();
  return {
    async get(key){await tail;return structuredClone(records[key]??null);},
    transaction(fn){const task=tail.then(async()=>{
      const draft=structuredClone(records);
      const tx={get:async key=>structuredClone(draft[key]??null),set:(key,value)=>{draft[key]=structuredClone(value);},delete:key=>{delete draft[key];}};
      const result=await fn(tx);
      if(path){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(draft),{mode:0o600});await rename(path+'.tmp',path);}
      records=draft;return result;
    });tail=task.catch(()=>{});return task;}
  };
}
export async function firestoreStore(projectId) {
  const {Firestore}=await import('@google-cloud/firestore');
  const db=new Firestore({projectId});const collection=db.collection('together_records');
  return {
    async get(key){const doc=await collection.doc(key).get();return doc.exists?doc.data():null;},
    transaction(fn){return db.runTransaction(async native=>fn({
      get:async key=>{const doc=await native.get(collection.doc(key));return doc.exists?doc.data():null;},
      set:(key,value)=>native.set(collection.doc(key),value),delete:key=>native.delete(collection.doc(key))
    }));}
  };
}
