import {serialize,deserialize,type Settings} from './persistence';
import type {Game,Result} from './engine';
import type {RedoStep} from './history';
import {legacySession,validSession,newSession,type GameSession} from './session';
export const CURRENT_GAME_KEY='meguru-shogi.v1';
export const ARCHIVE_PREFIX='meguru-shogi.archive.v1.';
const DELETED_PREFIX='meguru-shogi.archive-deleted.v1.';
export type ArchiveEntry={version:1;session:GameSession;savedAt:string;record:string;plies:number;result:Result|null;settings:Settings};
export type ArchiveSummary=Omit<ArchiveEntry,'record'>;
export interface StorageAdapter {getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<unknown>;getAllKeys():Promise<readonly string[]>;removeItem(key:string):Promise<unknown>;}
const signature=(raw:string)=>{const v=JSON.parse(raw);return JSON.stringify({moves:v.moves,resigned:v.resigned,rules:v.settings.rules});};
export function createGameRepository(storage:StorageAdapter){
 let pending:Promise<unknown>=Promise.resolve();
 const queue=<T>(work:()=>Promise<T>):Promise<T>=>{const task=pending.catch(()=>undefined).then(work);pending=task;return task;};
 const key=(s:GameSession)=>{if(!validSession(s))throw Error('Invalid game identity');return ARCHIVE_PREFIX+s.id;};
 async function archive(game:Game,settings:Settings,session:GameSession){
  if(!game.log.length&&!game.result)return;
  let k=key(session);const record=serialize(game,settings);let old=await storage.getItem(k);
  if(old){const previous=JSON.parse(old) as ArchiveEntry;if(previous.result){if(signature(previous.record)===signature(record))return;session={...session,id:session.id.slice(0,45)+'-branch-'+legacySession(signature(record)).id};k=key(session);old=await storage.getItem(k);}}
  if(await storage.getItem(DELETED_PREFIX+session.id)===legacySession(signature(record)).id)return;
  let savedAt=new Date().toISOString();if(old){const previous=JSON.parse(old) as ArchiveEntry;if(previous.record===record)return;if(previous.result&&game.result)savedAt=previous.savedAt;}
  const entry:ArchiveEntry={version:1,session,savedAt,record,plies:game.log.length,result:game.result,settings};await storage.setItem(k,JSON.stringify(entry));return entry;
 }
 return {
  loadGame:()=>queue(async()=>{const raw=await storage.getItem(CURRENT_GAME_KEY);if(!raw)return null;const saved=deserialize(raw);return {...saved,session:saved.session??legacySession(raw)};}),
  saveGame:(game:Game,settings:Settings,redo:RedoStep[]=[],session?:GameSession)=>{const raw=serialize(game,settings,redo,session);return queue(async()=>{await storage.setItem(CURRENT_GAME_KEY,raw);if(game.result&&session)await archive(game,settings,session);});},
  archiveGame:(game:Game,settings:Settings,session:GameSession)=>queue(()=>archive(game,settings,session)),
  importGame:(game:Game,settings:Settings,startedAt:string|null=null)=>queue(async()=>{
   if(!game.log.length&&!game.result)throw Error('指し手がありません。');
   const session={...newSession(),startedAt};
   if(!validSession(session))throw Error('対局日時が不正です。');
   const entry=await archive(game,settings,session);
   if(!entry)throw Error('棋譜を保存できませんでした。');
   const {record,...summary}=entry;
   return {summary,game,settings};
  }),
  archiveKeys:()=>queue(async()=>[...(await storage.getAllKeys())].filter(k=>k.startsWith(ARCHIVE_PREFIX)).sort((a,b)=>(Number(b.slice(ARCHIVE_PREFIX.length).split('-')[0])||0)-(Number(a.slice(ARCHIVE_PREFIX.length).split('-')[0])||0)||b.localeCompare(a))),
  archiveSummaries:(keys:string[])=>queue(async()=>{const rows=await Promise.all(keys.map(async k=>{if(!k.startsWith(ARCHIVE_PREFIX))throw Error('Invalid archive key');const raw=await storage.getItem(k);if(!raw)throw Error('履歴が見つかりません。');const e=JSON.parse(raw) as ArchiveEntry;if(e.version!==1||!validSession(e.session)||key(e.session)!==k||!Number.isFinite(Date.parse(e.savedAt))||!Number.isInteger(e.plies)||e.plies<0||typeof e.record!=='string'||!e.settings)throw Error('履歴を読み込めませんでした。');const {record,...summary}=e;return summary;}));return rows;}),
  deleteArchive:(session:GameSession)=>queue(async()=>{const k=key(session),raw=await storage.getItem(k);if(!raw)return;const e=JSON.parse(raw) as ArchiveEntry;await storage.setItem(DELETED_PREFIX+session.id,legacySession(signature(e.record)).id);await storage.removeItem(k);}),
  readArchive:(session:GameSession)=>queue(async()=>{const raw=await storage.getItem(key(session));if(!raw)throw Error('履歴が見つかりません。');const entry=JSON.parse(raw) as ArchiveEntry;if(entry.version!==1||!validSession(entry.session)||entry.session.id!==session.id)throw Error('履歴を読み込めませんでした。');const saved=deserialize(entry.record);if(saved.game.log.length!==entry.plies||JSON.stringify(saved.game.result)!==JSON.stringify(entry.result))throw Error('履歴の内容が一致しません。');return {entry,...saved};}),
 };
}
