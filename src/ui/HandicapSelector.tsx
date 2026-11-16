import React from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {HANDICAPS,HANDICAP_KINDS,type Handicap,type HandicapKind} from '../game/handicap';
import {colors} from './theme';

export function HandicapSelector({value,onChange}:{value:Handicap|undefined;onChange:(value:Handicap|undefined)=>void}){
  const kinds:('even'|HandicapKind)[]=['even',...HANDICAP_KINDS];
  return <View style={styles.section}>
    <Text style={styles.title}>手合割（駒落ち）</Text>
    <View style={styles.options}>{kinds.map(kind=>{
      const checked=kind===(value?.kind??'even');
      return <Pressable key={kind} testID={'handicap-'+kind} accessibilityRole="radio" accessibilityState={{checked}} aria-checked={checked}
        onPress={()=>onChange(kind==='even'?undefined:{kind,side:value?.side??'gote'})} style={[styles.option,checked&&styles.selected]}>
        <Text style={styles.text}>{kind==='even'?'平手':HANDICAPS[kind].label}{checked?' ✓':''}</Text>
      </Pressable>;
    })}</View>
    {value&&<>
      <Text style={styles.title}>駒を落とす側（上手）</Text>
      <View style={styles.options}>{(['sente','gote'] as const).map(side=><Pressable key={side} testID={'handicap-side-'+side} accessibilityRole="radio" accessibilityState={{checked:value.side===side}} aria-checked={value.side===side}
        onPress={()=>onChange({...value,side})} style={[styles.option,value.side===side&&styles.selected]}>
        <Text style={styles.text}>{side==='sente'?'先手':'後手'}側{value.side===side?' ✓':''}</Text>
      </Pressable>)}</View>
      <Text testID="handicap-help" style={styles.help}>{HANDICAPS[value.kind].description}を盤から外します。外した駒は持ち駒になりません。上手（{value.side==='sente'?'先手':'後手'}側）から指し始めます。</Text>
      <Text style={styles.help}>先手側・後手側はプレイヤー設定と盤上の駒の向きを表します。自駒回収と玉のルールは、下の設定に従います。</Text>
    </>}
  </View>;
}
const styles=StyleSheet.create({section:{gap:10},title:{fontSize:15,fontWeight:'700',color:colors.ink},options:{flexDirection:'row',flexWrap:'wrap',gap:8},option:{width:'47%',minHeight:44,padding:12,borderWidth:1,borderColor:colors.line,borderRadius:10,justifyContent:'center'},selected:{borderColor:colors.green,backgroundColor:colors.greenLight},text:{fontSize:14,fontWeight:'700',color:colors.ink},help:{fontSize:13,lineHeight:21,color:colors.muted}});
