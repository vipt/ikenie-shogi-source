import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {MAX_SHARED_RECORD_LENGTH, readSharedRecord, resolveSharedResignation, type ImportedRecord} from '../game/shared-record';
import type {Side} from '../game/engine';
import {colors} from './theme';

export function RecordImport({onImport,onCancel}: {onImport:(record:ImportedRecord)=>Promise<void>;onCancel:()=>void}) {
  const [text,setText] = useState('');
  const [busy,setBusy] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [pending,setPending] = useState<ImportedRecord|null>(null);
  const cancelled = useRef(false);
  const running = useRef(false);
  useEffect(()=>{cancelled.current=false;return()=>{cancelled.current=true;};},[]);
  async function submit(side?:Side) {
    if(running.current)return;
    running.current=true;setBusy(true);setError('');Keyboard.dismiss();
    try {
      const parsed = pending && side ? resolveSharedResignation(pending,side) : await readSharedRecord(text,()=>cancelled.current);
      if(cancelled.current)return;
      if(parsed.needsResignationSide){setPending(parsed);return;}
      setSaving(true);
      await onImport(parsed);
    } catch(e) {
      if(!cancelled.current)setError(e instanceof Error?e.message:'棋譜を読み込めませんでした。');
    } finally {
      running.current=false;
      if(!cancelled.current){setBusy(false);setSaving(false);}
    }
  }
  return <ScrollView testID="record-import" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
    <Text accessibilityRole="header" style={styles.title}>共有された棋譜を読み込む</Text>
    <Text style={styles.text}>メールやLINEなどで受け取った棋譜をコピーし、見出しから最後まで貼り付けてください。このアプリで共有した棋譜に対応しています。</Text>
    <Text style={styles.caption}>読み込んだ棋譜は対局履歴に保存します。現在の対局はそのまま残ります。</Text>
    <TextInput testID="record-import-text" accessibilityLabel="共有された棋譜" multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} editable={!busy}
      placeholder={'生贄将棋\n…共有された棋譜をここに貼り付け'} value={text} onChangeText={value=>{setText(value);setPending(null);setError('');}} style={styles.input}/>
    {text.length>MAX_SHARED_RECORD_LENGTH&&<Text style={styles.error}>20万文字以内の棋譜を貼り付けてください。</Text>}
    {error&&<Text testID="record-import-error" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    {busy&&<View style={styles.row}><ActivityIndicator color={colors.green}/><Text style={styles.caption}>{saving?'棋譜を保存しています…':'指し手を確認しています…'}</Text></View>}
    {pending?<View testID="record-import-resignation" style={styles.choice}>
      <Text style={styles.text}>この旧形式の棋譜には、投了した側が記録されていません。どちらが投了しましたか？</Text>
      {(['sente','gote'] as const).map(side=><Pressable key={side} testID={'import-resign-'+side} accessibilityRole="button" disabled={busy} onPress={()=>{void submit(side);}} style={[styles.button,busy&&styles.disabled]}><Text style={styles.buttonText}>{side==='sente'?'先手':'後手'}が投了 — 保存して再生</Text></Pressable>)}
    </View>:<Pressable testID="record-import-submit" accessibilityRole="button" disabled={busy||!text.trim()||text.length>MAX_SHARED_RECORD_LENGTH} onPress={()=>{void submit();}}
      style={[styles.button,(busy||!text.trim()||text.length>MAX_SHARED_RECORD_LENGTH)&&styles.disabled]}><Text style={styles.buttonText}>読み込んで再生</Text></Pressable>}
    <Pressable testID="record-import-cancel" accessibilityRole="button" disabled={saving} onPress={()=>{cancelled.current=true;onCancel();}} style={styles.cancel}><Text style={styles.cancelText}>{busy?'読み込みを中止':'履歴に戻る'}</Text></Pressable>
  </ScrollView>;
}
const styles=StyleSheet.create({form:{padding:16,gap:16,width:'100%',maxWidth:720,alignSelf:'center',paddingBottom:40},title:{fontSize:21,fontWeight:'700',color:colors.ink},text:{fontSize:14,lineHeight:22,color:colors.ink},caption:{fontSize:13,lineHeight:20,color:colors.muted},input:{minHeight:220,borderWidth:1,borderColor:colors.line,borderRadius:10,padding:12,fontSize:14,lineHeight:22,color:colors.ink,backgroundColor:colors.paper},button:{minHeight:48,padding:14,borderRadius:10,backgroundColor:colors.green,alignItems:'center'},buttonText:{fontSize:15,fontWeight:'700',color:colors.paper},disabled:{opacity:.35},cancel:{padding:14,alignItems:'center'},cancelText:{color:colors.green,fontSize:14,fontWeight:'700'},error:{color:colors.red,fontSize:14,lineHeight:22},row:{flexDirection:'row',gap:10,alignItems:'center'},choice:{gap:12}});
