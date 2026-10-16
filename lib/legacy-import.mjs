// Safe client-side preparation of legacy wager imports. No secret credentials involved.
const normalized = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const amount = value => Number(value);
export function wagerFingerprint(w) {
  return JSON.stringify([normalized(w.date),normalized(w.event),normalized(w.selections),normalized(w.market),normalized(w.sportsbook),amount(w.odds),amount(w.stake)]);
}
export function isValidLegacyWager(w) {
  return !!w && typeof w === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(w.date??'')) &&
    ['win','loss','push','void','pending'].includes(w.result) &&
    normalized(w.event).length > 0 && normalized(w.selections).length > 0 && normalized(w.market).length > 0 && normalized(w.sportsbook).length > 0 &&
    Number.isInteger(Number(w.odds)) && Math.abs(Number(w.odds)) >= 100 && Number.isFinite(Number(w.stake)) && Number(w.stake) > 0 &&
    (w.returnOverride == null || (Number.isFinite(Number(w.returnOverride)) && Number(w.returnOverride)>=0));
}
export async function deterministicWagerId(userId, w, digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))) {
  // UUIDv5-like name-based 128-bit identifier derived from a SHA-256 digest.
  // Include user ownership and record fingerprint so distinct bets do not share a fallback ID.
  const bytes = (await digest('fourthdown-p02-legacy-v2\0'+userId+'\0'+normalized(w.id)+'\0'+wagerFingerprint(w))).slice(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x50; bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function planLegacyImport(userId, legacy, existing) {
  const existingFingerprints=new Set(existing.map(wagerFingerprint));
  const seen=new Set();const accepted=[];let duplicates=0;let invalid=0;
  for(const w of legacy){
    if(!isValidLegacyWager(w)){invalid++;continue;}
    const fp=wagerFingerprint(w);
    if(existingFingerprints.has(fp)||seen.has(fp)){duplicates++;continue;}
    seen.add(fp);
    accepted.push({...w,id:await deterministicWagerId(userId,w)});
  }
  return {accepted,duplicates,invalid};
}
