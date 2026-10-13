import { CONFIG } from './config.js';
import { prepareVaultSession, clearVaultSession } from './token-vault.js';

const sessionKey = 'prosto-test-creator-v1';
let unlocked = false;
try { unlocked = sessionStorage.getItem(sessionKey) === CONFIG.creatorPasswordHash; } catch {}

export const isCreatorUnlocked = () => unlocked;
export const isCreatorRoute = section => ['admin','edit','preview','run-preview','preview-result'].includes(section);

// A convenience gate for the static UI; GitHub still authorizes every publication.
export async function unlockCreator(password) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
  if (hash !== CONFIG.creatorPasswordHash) return false;
  await prepareVaultSession(password);
  unlocked = true;
  try { sessionStorage.setItem(sessionKey, CONFIG.creatorPasswordHash); } catch {}
  return true;
}

export function lockCreator() {
  unlocked = false;
  clearVaultSession();
  try { sessionStorage.removeItem(sessionKey); } catch {}
}
