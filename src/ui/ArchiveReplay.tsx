import React,{useRef,useState,useEffect} from 'react';
import {View,Text,Pressable,FlatList,StyleSheet} from 'react-native';
import {Board} from './Board';
import {colors} from './theme';
import {HAND_KINDS,LABELS,SIDE_LABEL,isInCheck,type Game,type Side} from '../game/engine';
import {selfCaptureCounts} from '../game/presentation';
const noop=()=>{};const noOrigin=async()=>null;
export function ArchiveAction({id,label,disabled,onPress}:{id:string;label:string;disabled?:boolean;onPress:()=>void}){
 return <Pressable testID={id} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,disabled&&{opacity:.3}]}><Text maxFontSizeMultiplier={1.3} style={styles.buttonText}>{label}</Text></Pressable>;
}
export function ArchiveReplay({game,initialFlipped,result,onBack,onShare,onDelete}:{game:Game;initialFlipped:boolean;result:string;onBack:()=>void;onShare:()=>void;onDelete:()=>void}){
 const [ply,setPly]=useState(0),[flipped,setFlipped]=useState(initialFlipped);
 const [area,setArea]=useState({width:360,height:680}),[topHeight,setTopHeight]=useState(64),[bottomHeight,setBottomHeight]=useState(76),[toolbarHeight,setToolbarHeight]=useState(74);
 const list=useRef<FlatList<Game['log'][number]>>(null);
 const wide=area.width>=640;
 const panelWidth=wide?Math.min(600,Math.floor(area.width*.56)):area.width;
 const boardWidth=Math.floor(Math.max(80,Math.min(540,panelWidth-44,area.height-(wide?0:toolbarHeight+112)-topHeight-bottomHeight-24)));
 const position=game.trail[ply]!.position;
 const counts=selfCaptureCounts({...game,log:game.log.slice(0,ply)});
 const jump=(n:number)=>{setPly(n);list.current?.scrollToOffset({offset:Math.max(0,(n-2)*44),animated:false});};
 useEffect(()=>{list.current?.scrollToOffset({offset:Math.max(0,(ply-2)*44),animated:false});},[wide]);
 const hand=(side:Side)=><View testID={'archive-hand-'+side} style={styles.hand}>
  <Text maxFontSizeMultiplier={1.3} style={styles.handText}>{SIDE_LABEL[side]}　持ち駒 {HAND_KINDS.filter(k=>position.hands[side][k]).map(k=>LABELS[k]+position.hands[side][k]).join(' ')||'なし'}</Text>
  <Text maxFontSizeMultiplier={1.3} style={styles.handText}>自駒回収 {counts[side]}回</Text>
 </View>;
 const toolbar=<View testID="archive-replay-toolbar" onLayout={e=>setToolbarHeight(e.nativeEvent.layout.height)} style={styles.toolbar}>
  <View style={styles.actions}><ArchiveAction id="archive-back" label="← 一覧" onPress={onBack}/><ArchiveAction id="archive-flip" label="⇅ 反転" onPress={()=>setFlipped(f=>!f)}/><ArchiveAction id="archive-share" label="共有" onPress={onShare}/><ArchiveAction id="archive-delete" label="削除" onPress={onDelete}/></View>
  <Text testID="archive-result" maxFontSizeMultiplier={1.3} style={styles.result}>{result} · {game.log.length}手</Text>
 </View>;
 const board=<View testID="archive-fixed-board" style={{width:panelWidth,flexShrink:0}}>
  <View onLayout={e=>setTopHeight(e.nativeEvent.layout.height)} style={styles.boardTop}>
   <View style={styles.status}><Text testID="archive-ply" maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite" style={styles.ply}>{ply} / {game.log.length} 手</Text><Text testID="archive-last-move" maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.last}>{ply?game.log[ply-1]!.label:'開始前'}</Text></View>
   {hand(flipped?'sente':'gote')}
  </View>
  <View style={{alignItems:'center'}}><Board position={position} width={boardWidth} flipped={flipped} selected={null} moves={[]} lastMove={game.log[ply-1]?.move} checked={isInCheck(position,position.turn)} onSquare={noop} disabled onAnimationComplete={noop} getDropOrigin={noOrigin}/></View>
  <View onLayout={e=>setBottomHeight(e.nativeEvent.layout.height)} style={styles.boardBottom}>
   {hand(flipped?'gote':'sente')}
   <View testID="archive-fixed-controls" style={styles.actions}><ArchiveAction id="archive-first" label="最初" disabled={!ply} onPress={()=>jump(0)}/><ArchiveAction id="archive-prev" label="◀ 戻る" disabled={!ply} onPress={()=>jump(ply-1)}/><ArchiveAction id="archive-next" label="進む ▶" disabled={ply===game.log.length} onPress={()=>jump(ply+1)}/><ArchiveAction id="archive-last" label="最後" disabled={ply===game.log.length} onPress={()=>jump(game.log.length)}/></View>
  </View>
 </View>;
 const moves=<View testID="archive-moves-panel" style={styles.movesPanel}>
  <Text maxFontSizeMultiplier={1.3} style={styles.listTitle}>指し手一覧 · タップして局面を表示</Text>
  <FlatList ref={list} testID="archive-move-list" style={{flex:1,minHeight:0}} data={game.log} extraData={ply} keyExtractor={(_,i)=>String(i)} getItemLayout={(_,i)=>({length:44,offset:44*i,index:i})} initialNumToRender={12} windowSize={5} keyboardShouldPersistTaps="handled"
   ListEmptyComponent={<Text style={styles.empty}>指し手はありません。</Text>}
   renderItem={({item,index})=><Pressable testID={'archive-move-'+(index+1)} accessibilityRole="button" accessibilityLabel={(index+1)+'手目 '+item.label} accessibilityState={{selected:ply===index+1}} onPress={()=>setPly(index+1)} style={[styles.move,ply===index+1&&styles.selectedMove]}><Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.moveText}>{index+1}　{item.label}</Text></Pressable>}/>
 </View>;
 return <View testID="archive-replay" style={styles.replay} onLayout={e=>setArea({width:e.nativeEvent.layout.width,height:e.nativeEvent.layout.height})}>
  {wide?<View style={styles.columns}>{board}<View style={styles.right}>{toolbar}{moves}</View></View>:<>{toolbar}{board}{moves}</>}
 </View>;
}
const styles=StyleSheet.create({replay:{flex:1,minHeight:0},columns:{flex:1,flexDirection:'row',minHeight:0},right:{flex:1,minWidth:0},toolbar:{paddingHorizontal:12,paddingTop:6,paddingBottom:4,gap:4,flexShrink:0},actions:{flexDirection:'row',gap:6,justifyContent:'center'},button:{minHeight:44,paddingHorizontal:10,paddingVertical:10,borderRadius:9,justifyContent:'center',backgroundColor:colors.greenLight},buttonText:{color:colors.green,fontSize:13,fontWeight:'700'},result:{fontSize:12,lineHeight:18,color:colors.muted,textAlign:'center'},boardTop:{paddingHorizontal:12,paddingBottom:4,gap:4},boardBottom:{paddingHorizontal:12,paddingTop:6,paddingBottom:8,gap:6},status:{flexDirection:'row',gap:8,alignItems:'center',minHeight:24},ply:{fontSize:15,fontWeight:'700',color:colors.ink},last:{flex:1,fontSize:13,color:colors.ink,textAlign:'right'},hand:{flexDirection:'row',justifyContent:'space-between',flexWrap:'wrap',columnGap:6,paddingVertical:3,paddingHorizontal:6,backgroundColor:colors.greenLight,borderRadius:6},handText:{fontSize:11,lineHeight:16,color:colors.ink},movesPanel:{flex:1,minHeight:0,borderTopWidth:1,borderColor:colors.line,marginHorizontal:12},listTitle:{fontSize:11,lineHeight:20,color:colors.muted,paddingVertical:2},move:{height:44,justifyContent:'center',paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:colors.line},selectedMove:{backgroundColor:colors.greenLight},moveText:{fontSize:14,color:colors.ink},empty:{padding:12,color:colors.muted}});
