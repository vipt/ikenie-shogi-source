import type {GameSession} from '../game/session';
import React,{useEffect,useState} from 'react';
import {ScrollView,BackHandler,ActivityIndicator,Pressable,Text,View,Share,StyleSheet} from 'react-native';
import {archiveGame,archiveKeys,archiveSummaries,readArchive,deleteArchive,importGame} from '../game/storage';
import {ARCHIVE_PREFIX,type ArchiveSummary} from '../game/archive-store';
import {playerFor} from '../game/match-settings';
import {SIDE_LABEL,type Game,type Result} from '../game/engine';
import type {Settings} from '../game/persistence';
import {ArchiveReplay} from './ArchiveReplay';
import {RecordImport} from './RecordImport';
import {formatSharedRecord,type ImportedRecord} from '../game/shared-record';
import {colors} from './theme';
const reasons={mate:'詰み','no-moves':'指せる手なし',repetition:'千日手','perpetual-check':'連続王手',resign:'投了','move-limit':'手数上限'};
export const archiveResult=(r:Result|null)=>r?(r.winner?SIDE_LABEL[r.winner]+'の勝ち':'引き分け')+' · '+reasons[r.reason]:'途中終了';
const dateLabel=(s:ArchiveSummary)=>s.session.startedAt?new Date(s.session.startedAt).toLocaleString('ja-JP'):'日時不明';
const players=(s:Settings)=>(['sente','gote'] as const).map(side=>{const p=playerFor(s,side);return SIDE_LABEL[side]+' '+(p.kind==='cpu'?'CPU Lv.'+p.level:'人間');}).join(' ／ ');
const rules=(s:Settings)=>({both:'両者回収可',sente:'先手だけ回収可',gote:'後手だけ回収可',none:'回収なし'})[s.rules.selfCapture??'both']+' · 玉：'+({all:'味方も取れる',enemy:'相手のみ',none:'取れない'})[s.rules.kingCapture];
function Action({id,label,disabled,onPress}:{id:string;label:string;disabled?:boolean;onPress:()=>void}){return <Pressable testID={id} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,disabled&&{opacity:.3}]}><Text style={styles.buttonText}>{label}</Text></Pressable>;}
export function ArchiveBrowser({onClose,snapshot}:{onClose:()=>void;snapshot:{game:Game;settings:Settings;session:GameSession}}){
 const [keys,setKeys]=useState<string[]>([]),[rows,setRows]=useState<ArchiveSummary[]>([]),[loaded,setLoaded]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [confirmDelete,setConfirmDelete]=useState(false);
 const [importing,setImporting]=useState(false),[importNotice,setImportNotice]=useState('');
 const [record,setRecord]=useState<{summary:ArchiveSummary;game:Game;settings:Settings}|null>(null);
 useEffect(()=>{const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{if(loading)return true;if(confirmDelete){setConfirmDelete(false);}else if(importing){setImporting(false);}else if(record){setRecord(null);setError('');setImportNotice('');}else onClose();return true;});return()=>subscription.remove();},[record,onClose,confirmDelete,importing,loading]);
 useEffect(()=>{let active=true;void(async()=>{try{if(snapshot.game.result)await archiveGame(snapshot.game,snapshot.settings,snapshot.session);const all=await archiveKeys(),batch=await archiveSummaries(all.slice(0,20));if(active){setKeys(all);setRows(batch);setLoaded(batch.length);}}catch{if(active)setError('履歴を読み込めませんでした。閉じてから、もう一度開いてください。');}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[]);
 async function more(){if(loading)return;setLoading(true);setError('');try{const batch=await archiveSummaries(keys.slice(loaded,loaded+20));setRows(r=>[...r,...batch]);setLoaded(n=>n+batch.length);}catch{setError('履歴を読み込めませんでした。再試行してください。');}finally{setLoading(false);}}
 async function open(summary:ArchiveSummary){if(loading)return;setLoading(true);setError('');try{const saved=await readArchive(summary.session);setRecord({summary,game:saved.game,settings:saved.settings});setConfirmDelete(false);}catch{setError('この棋譜を読み込めませんでした。保存データはそのまま残っています。');}finally{setLoading(false);}}
 async function share(){if(!record)return;try{await Share.share({message:formatSharedRecord(record.game,record.settings,record.summary.session.startedAt)});}catch{setError('棋譜の共有を開けませんでした。');}}
 async function acceptImport(parsed:ImportedRecord){
  setLoading(true);
  try{
   const saved=await importGame(parsed.game,parsed.settings,parsed.startedAt);
   setKeys(items=>[ARCHIVE_PREFIX+saved.summary.session.id,...items]);setRows(items=>[saved.summary,...items]);setLoaded(n=>n+1);
   setRecord(saved);setImporting(false);setError('');setImportNotice(parsed.warnings.join('\n'));
  }catch{throw Error('棋譜を保存できませんでした。端末の空き容量などを確認して、もう一度お試しください。');}finally{setLoading(false);}
 }
 async function remove(){if(!record||loading)return;setLoading(true);try{await deleteArchive(record.summary.session);const all=await archiveKeys(),batch=await archiveSummaries(all.slice(0,20));setKeys(all);setRows(batch);setLoaded(batch.length);setRecord(null);setConfirmDelete(false);}catch{setError('削除できませんでした。もう一度お試しください。');}finally{setLoading(false);}}
 return <View testID="archive-browser" style={{flex:1,minHeight:0}}>
 {error?<Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>:null}
 {importNotice?<Text testID="record-import-notice" accessibilityLiveRegion="polite" style={styles.caption}>{importNotice}</Text>:null}
 {importing?<RecordImport onImport={acceptImport} onCancel={()=>{setImporting(false);setError('');}}/>:record?<ArchiveReplay key={record.summary.session.id} game={record.game} initialFlipped={record.settings.flipped} result={archiveResult(record.game.result)} onBack={()=>{setRecord(null);setError('');setImportNotice('');}} onShare={()=>{void share();}} onDelete={()=>setConfirmDelete(true)}/>:<ScrollView testID="archive-screen-scroll" style={{flex:1}} contentContainerStyle={{padding:16,gap:12,width:'100%',maxWidth:720,alignSelf:'center'}}>
  <Action id="open-record-import" label="共有された棋譜を読み込む" disabled={loading} onPress={()=>{setError('');setImportNotice('');setImporting(true);}}/>
  <Text style={styles.caption}>終了した対局と、新しい対局に切り替えた途中の対局を、この端末に保存します。</Text>
  <Text testID="archive-count" style={styles.title}>{keys.length}件の対局</Text>
  {!loading&&!keys.length&&!error&&<Text testID="archive-empty" style={styles.text}>まだ対局履歴はありません。</Text>}
  {rows.map((s,i)=><Pressable testID={'archive-entry-'+i} key={s.session.id} accessibilityRole="button" disabled={loading} onPress={()=>{void open(s);}} style={styles.card}><Text style={styles.caption}>{dateLabel(s)}</Text><Text style={styles.title}>{archiveResult(s.result)} · {s.plies}手</Text><Text style={styles.text}>{players(s.settings)}</Text><Text style={styles.caption}>{rules(s.settings)}</Text><Text style={styles.buttonText}>棋譜を見る →</Text></Pressable>)}
  {loaded<keys.length&&<Action id="archive-more" label="さらに20件表示" disabled={loading} onPress={()=>{void more();}}/>}
 </ScrollView>}
 {loading&&<ActivityIndicator style={{position:'absolute',top:8,right:8}} color={colors.green}/>}
 {confirmDelete&&record&&<View style={styles.confirmOverlay}><View style={styles.confirmCard}><Text style={styles.text}>この棋譜を履歴から削除します。現在の対局は残ります。</Text><View style={styles.row}><Action id="archive-delete-cancel" label="やめる" disabled={loading} onPress={()=>setConfirmDelete(false)}/><Action id="archive-delete-confirm" label="削除する" disabled={loading} onPress={()=>{void remove();}}/></View></View></View>}
 </View>;
}
const styles=StyleSheet.create({confirmOverlay:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'#132A2488',justifyContent:'center',alignItems:'center',padding:20},confirmCard:{maxWidth:360,padding:20,gap:16,borderRadius:14,backgroundColor:colors.paper},text:{color:colors.ink,fontSize:14,lineHeight:22},caption:{color:colors.muted,fontSize:12,lineHeight:20},title:{color:colors.ink,fontSize:17,fontWeight:'700'},error:{color:colors.red,fontSize:14},row:{flexDirection:'row',gap:6,flexWrap:'wrap'},button:{paddingHorizontal:10,paddingVertical:12,borderRadius:10,backgroundColor:colors.greenLight,minHeight:44},buttonText:{color:colors.green,fontSize:13,fontWeight:'700'},card:{gap:6,padding:16,borderRadius:14,borderWidth:1,borderColor:colors.line,backgroundColor:colors.paper},hand:{padding:8,backgroundColor:colors.greenLight,borderRadius:10,gap:3},move:{paddingVertical:10,borderBottomWidth:1,borderColor:colors.line}});
