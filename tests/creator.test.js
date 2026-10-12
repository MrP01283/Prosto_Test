import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../src/config.js';
import {isCreatorRoute,isCreatorUnlocked,unlockCreator,lockCreator} from '../src/creator.js';

test('every creator route is gated while participant routes remain public',()=>{
 for(const route of ['admin','edit','preview','run-preview','preview-result'])assert.equal(isCreatorRoute(route),true);
 for(const route of ['catalog','test','run','result','history'])assert.equal(isCreatorRoute(route),false);
});
test('an incorrect password never opens the creator gate',async()=>{
 lockCreator();assert.equal(await unlockCreator('incorrect-password'),false);assert.equal(isCreatorUnlocked(),false);
});
test('tab session survives module reload and logout removes the remembered entry',async()=>{
 const values=new Map([['prosto-test-creator-v1',CONFIG.creatorPasswordHash]]);
 const original=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:key=>values.get(key),removeItem:key=>values.delete(key)}});
 try {
   const restored=await import('../src/creator.js?restored-test');assert.equal(restored.isCreatorUnlocked(),true);
   restored.lockCreator();assert.equal(restored.isCreatorUnlocked(),false);assert.equal(values.size,0);
   values.set('prosto-test-creator-v1','outdated-password-hash');
   const stale=await import('../src/creator.js?stale-test');assert.equal(stale.isCreatorUnlocked(),false);
 } finally {if(original)Object.defineProperty(globalThis,'sessionStorage',original);else delete globalThis.sessionStorage;}
});
