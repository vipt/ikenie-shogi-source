import React from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import type {Game} from '../game/engine';
import type {Settings} from '../game/persistence';
import type {GameSession} from '../game/session';
import {ArchiveBrowser} from './ArchiveBrowser';
import {colors,serif} from './theme';
export function ArchiveScreen({snapshot,onClose}:{snapshot:{game:Game;settings:Settings;session:GameSession};onClose:()=>void}){
 return <View testID="archive-screen" style={styles.screen}>
  <View testID="archive-screen-header" style={styles.header}>
   <Pressable testID="close-archives" accessibilityRole="button" accessibilityLabel="現在の対局に戻る" onPress={onClose} style={styles.back}><Text style={styles.backText}>← 対局に戻る</Text></Pressable>
   <Text accessibilityRole="header" style={styles.title}>対局履歴</Text>
  </View>
  <ArchiveBrowser snapshot={snapshot} onClose={onClose}/>
 </View>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:colors.paper},header:{flexShrink:0,backgroundColor:colors.paper,flexDirection:'row',alignItems:'center',gap:20,paddingHorizontal:16,paddingVertical:8,borderBottomWidth:1,borderBottomColor:colors.line},back:{minHeight:44,justifyContent:'center',paddingRight:8},backText:{fontSize:14,fontWeight:'700',color:colors.green},title:{fontFamily:serif,fontSize:22,fontWeight:'600',color:colors.ink},content:{width:'100%',maxWidth:720,alignSelf:'center',padding:16,paddingBottom:32}});
