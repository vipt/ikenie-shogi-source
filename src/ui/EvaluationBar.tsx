import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,View} from 'react-native';
import {colors} from './theme';

export function EvaluationBar({percent}:{percent:number|null}){
  const value=useRef(new Animated.Value(percent??50)).current;
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    let active=true;void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(active)setReduced(v);});
    const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return ()=>{active=false;subscription.remove();};
  },[]);
  useEffect(()=>{
    if(percent===null)return;
    const animation=Animated.timing(value,{toValue:percent,duration:reduced?0:450,easing:Easing.inOut(Easing.cubic),useNativeDriver:false});
    animation.start();return ()=>animation.stop();
  },[percent,reduced,value]);
  return <View testID="evaluation-bar" accessibilityRole="progressbar" accessibilityLabel="先手の形勢" accessibilityValue={percent===null?{text:'計算中'}:{min:0,max:100,now:percent}}
    style={{height:8,borderRadius:8,overflow:'hidden',backgroundColor:colors.orange,opacity:percent===null?.35:1}}>
    <Animated.View testID="evaluation-bar-fill" style={{height:'100%',backgroundColor:colors.green,width:value.interpolate({inputRange:[0,100],outputRange:['0%','100%'],extrapolate:'clamp'})}} />
  </View>;
}
