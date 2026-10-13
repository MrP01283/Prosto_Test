import test from 'node:test';
import assert from 'node:assert/strict';
const vaultName='prosto-test-github-vault-v1', sessionName='prosto-test-github-session-v1';
let index=0;
const load=()=>import(`../src/token-vault.js?test=${++index}`);
function storage(){const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
function setup(t){
  const local=storage(),session=storage();
  const originals=['localStorage','sessionStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:local});Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:session});
  t.after(()=>{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  return {local,session};
}
test('remembered token is encrypted, survives a reload, locks on logout and opens with password',async t=>{
  const {local,session}=setup(t);const vault=await load();
  const password='test-only-password',token='fake_token_for_tests';
  await vault.prepareVaultSession(password);await vault.rememberToken(token);
  assert.equal(vault.hasRememberedToken(),true);
  for(const value of [...local.map.values(),...session.map.values()]){assert.ok(!value.includes(token));assert.ok(!value.includes(password));}
  const reloaded=await load();assert.equal(await reloaded.restoreToken(),token);
  reloaded.clearVaultSession();assert.equal(session.getItem(sessionName),null);assert.ok(local.getItem(vaultName));
  await assert.rejects(()=>reloaded.restoreToken(),/войдите снова/);
  const restarted=await load();await restarted.prepareVaultSession(password);assert.equal(await restarted.restoreToken(),token);
  restarted.forgetToken();assert.equal(restarted.hasRememberedToken(),false);assert.equal(await restarted.restoreToken(),null);
});
test('wrong password and altered ciphertext cannot decrypt a remembered token',async t=>{
  const {local}=setup(t);const vault=await load();await vault.prepareVaultSession('original');await vault.rememberToken('fake');
  await vault.prepareVaultSession('wrong');await assert.rejects(()=>vault.restoreToken(),/разблокировать/);
  await vault.prepareVaultSession('original');const saved=JSON.parse(local.getItem(vaultName));saved.ciphertext=(saved.ciphertext[0]==='A'?'B':'A')+saved.ciphertext.slice(1);local.setItem(vaultName,JSON.stringify(saved));
  await assert.rejects(()=>vault.restoreToken(),/разблокировать/);
});
test('bad local records can be replaced and unavailable storage produces a useful error',async t=>{
  const {local,session}=setup(t);local.setItem(vaultName,'not JSON');session.setItem(sessionName,'not JSON');
  const vault=await load();assert.equal(vault.hasVaultSession(),false);
  await assert.rejects(()=>vault.restoreToken(),/прочитать/);await vault.prepareVaultSession('password');await vault.rememberToken('replacement');assert.equal(await vault.restoreToken(),'replacement');
  local.setItem=()=>{throw new Error('QuotaExceededError');};await assert.rejects(()=>vault.rememberToken('new token'),/не разрешил сохранить/);
});
