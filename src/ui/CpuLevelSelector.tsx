import React from 'react';
import {Pressable,Text,View,StyleSheet} from 'react-native';
import {CPU_LEVELS,cpuLevelDescription,type CpuLevel} from '../game/cpu-levels';
import {colors} from './theme';
export function CpuLevelSelector({value,onChange,idPrefix='cpu-level',labelPrefix='CPUレベル'}:{value:CpuLevel;onChange:(level:CpuLevel)=>void;idPrefix?:string;labelPrefix?:string}){
 return <View style={styles.container}>
  <Text testID={idPrefix+'-value'} style={styles.value}>レベル {value} / 10</Text>
  <View style={styles.grid}>{CPU_LEVELS.map(level=><Pressable key={level} testID={idPrefix+'-'+level} accessibilityRole="radio" accessibilityLabel={labelPrefix+level} accessibilityState={{checked:level===value}} onPress={()=>onChange(level)} style={[styles.button,level===value&&styles.selected]}><Text style={[styles.number,level===value&&styles.selectedNumber]}>{level}</Text></Pressable>)}</View>
  <View style={styles.ends}><Text style={styles.hint}>弱め</Text><Text style={styles.hint}>強め</Text></View>
  <Text testID={idPrefix+'-description'} style={styles.hint}>{cpuLevelDescription(value)}</Text>
  <Text style={styles.note}>レベルが高いほど深く考えます。対局ごとの強さの目安です。</Text>
 </View>;
}
const styles=StyleSheet.create({container:{gap:10,marginBottom:12},value:{fontSize:20,fontWeight:'700',color:colors.ink},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{width:'17%',minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:10,borderWidth:1,borderColor:colors.line,backgroundColor:colors.paper},selected:{backgroundColor:colors.green,borderColor:colors.green},number:{fontSize:18,fontWeight:'700',color:colors.ink},selectedNumber:{color:'#fff'},ends:{flexDirection:'row',justifyContent:'space-between'},hint:{fontSize:13,lineHeight:20,color:colors.muted},note:{fontSize:12,lineHeight:18,color:colors.muted}});
