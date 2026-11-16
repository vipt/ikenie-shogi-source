export type GameSession={id:string;startedAt:string|null};
export function newSession():GameSession {const now=new Date();return {id:now.getTime()+'-'+Math.random().toString(36).slice(2,12),startedAt:now.toISOString()};}
export function validSession(v:unknown):v is GameSession {if(!v||typeof v!=='object')return false;const s=v as GameSession;return typeof s.id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(s.id)&&(s.startedAt===null||typeof s.startedAt==='string'&&Number.isFinite(Date.parse(s.startedAt)));}
/** Stable identity when importing the single saved match from older versions. Its date is unknown. */
export function legacySession(raw:string):GameSession {let a=2166136261,b=0x9e3779b9;for(let i=0;i<raw.length;i++){a=Math.imul(a^raw.charCodeAt(i),16777619);b=Math.imul(b^raw.charCodeAt(i),2246822519);}return {id:'legacy-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+raw.length,startedAt:null};}
