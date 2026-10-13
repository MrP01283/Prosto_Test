import { CONFIG } from './config.js';

const vaultName='prosto-test-github-vault-v1', sessionName='prosto-test-github-session-v1';
const encoder=new TextEncoder(), context=encoder.encode(`Prosto Test:GitHub:${CONFIG.owner}/${CONFIG.repo}:v1`);
const iterations=310000;
let session=null;
const encode=bytes=>btoa(String.fromCharCode(...bytes));
const decode=text=>Uint8Array.from(atob(text),char=>char.charCodeAt(0));
function validSession(value) {return value?.version===1&&typeof value.salt==='string'&&decode(value.salt).length===16&&typeof value.key==='string'&&decode(value.key).length===32;}
try {const saved=JSON.parse(sessionStorage.getItem(sessionName));if(validSession(saved))session=saved;}catch{}

export function hasRememberedToken() {try{return !!localStorage.getItem(vaultName);}catch{return false;}}
export const hasVaultSession=()=>!!session;
function readVault() {
  let value;
  try {value=JSON.parse(localStorage.getItem(vaultName));}catch{throw new Error('Не удалось прочитать сохранённый ключ. Подключите GitHub заново.');}
  if(value===null)return null;
  try {
    if(value.version===1&&value.iterations===iterations&&decode(value.salt).length===16&&decode(value.iv).length===12&&typeof value.ciphertext==='string'&&value.ciphertext.length<12000)return value;
  }catch{}
  throw new Error('Сохранённый ключ повреждён. Удалите его и подключите GitHub заново.');
}
// Only the derived key is retained for this tab. The password is never stored.
export async function prepareVaultSession(password) {
  let salt;
  try {salt=readVault()?.salt;}catch{}
  salt??=encode(crypto.getRandomValues(new Uint8Array(16)));
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decode(salt),iterations},material,256);
  session={version:1,salt,key:encode(new Uint8Array(bits))};
  try {sessionStorage.setItem(sessionName,JSON.stringify(session));}catch{}
}
async function encryptionKey(value) {return crypto.subtle.importKey('raw',decode(value.key),'AES-GCM',false,['encrypt','decrypt']);}
export async function rememberToken(token) {
  if(!session)throw new Error('Введите пароль создателя для сохранения ключа.');
  const active=session,iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:context},await encryptionKey(active),encoder.encode(token.trim()));
  if(session!==active)throw new Error('Сессия создателя завершена. Войдите снова.');
  try {localStorage.setItem(vaultName,JSON.stringify({version:1,iterations,salt:active.salt,iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))}));}
  catch {throw new Error('Браузер не разрешил сохранить ключ. Разрешите хранение данных сайта или подключитесь без запоминания.');}
}
export async function restoreToken() {
  const saved=readVault();if(!saved)return null;
  const active=session;
  if(!active||active.salt!==saved.salt)throw new Error('Чтобы разблокировать сохранённый ключ, выйдите из конструктора и войдите снова с паролем.');
  try {
    const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(saved.iv),additionalData:context},await encryptionKey(active),decode(saved.ciphertext));
    if(session!==active)throw new Error('Session ended');
    return new TextDecoder().decode(bytes);
  }catch{throw new Error('Не удалось разблокировать сохранённый ключ. Если пароль изменился, подключите GitHub заново.');}
}
export function forgetToken() {
  try {localStorage.removeItem(vaultName);}catch{throw new Error('Браузер не разрешил удалить сохранённый ключ. Очистите данные сайта в настройках браузера.');}
}
export function clearVaultSession() {
  session=null;
  try {sessionStorage.removeItem(sessionName);}catch{}
}
