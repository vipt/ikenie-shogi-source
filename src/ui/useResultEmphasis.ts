import {useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing} from 'react-native';
import {isNewResult} from '../game/result-display';

/** One color pulse in the winner's existing tray; never changes layout or scroll. */
export function useResultEmphasis(key:string|null,ready:boolean,replayed:boolean,foreground:boolean){
 const previous=useRef<string|null|undefined>(undefined);
 const pulse=useRef(new Animated.Value(0)).current;
 const [reduced,setReduced]=useState(true),[pulsing,setPulsing]=useState(false);
 useEffect(()=>{
  let active=true;
  void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value);}).catch(()=>{});
  const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
  return()=>{active=false;sub.remove();};
 },[]);
 useEffect(()=>{
  if(!ready)return;
  const fresh=isNewResult(previous.current,key);previous.current=key;
  pulse.stopAnimation();pulse.setValue(0);setPulsing(false);
  if(!fresh||reduced||replayed||!foreground)return;
  setPulsing(true);
  const motion=Animated.sequence([
   Animated.timing(pulse,{toValue:1,duration:300,easing:Easing.out(Easing.quad),useNativeDriver:false}),
   Animated.timing(pulse,{toValue:0,duration:650,easing:Easing.inOut(Easing.quad),useNativeDriver:false}),
  ]);
  motion.start(({finished})=>{if(finished)setPulsing(false);});
  return()=>motion.stop();
 },[key,ready,replayed,foreground,reduced,pulse]);
 return {pulse,pulsing};
}
