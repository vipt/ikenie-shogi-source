import React,{useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {AccessibilityInfo,Animated,Easing,StyleSheet,View} from 'react-native';
import Svg,{Circle,Line} from 'react-native-svg';
import {HAND_KINDS,type HandKind,type Side} from '../game/engine';
import {movingPiece,squareCenter,type BoardPoint,type CpuAnimation} from '../game/cpu-animation';
import {PieceView} from './PieceView';
import {colors} from './theme';
export type DropOrigin=(side:Side,kind:HandKind)=>Promise<BoardPoint|null>;
export const CPU_MOVE_DURATION=550;
export function CpuMoveOverlay({motion,width,flipped,frameRef,getDropOrigin,onComplete}:{motion:CpuAnimation;width:number;flipped:boolean;frameRef:RefObject<React.ComponentRef<typeof View>|null>;getDropOrigin:DropOrigin;onComplete:(id:number)=>void}){
 const progress=useRef(new Animated.Value(0)).current;
 const [reduced,setReduced]=useState<boolean|null>(null);
 const [dropOrigin,setDropOrigin]=useState<BoardPoint|null>(null);
 const piece=movingPiece(motion),size=(width-12)/9,pieceSize=size*.88;
 const end=useMemo(()=>squareCenter(motion.move.to,width,flipped),[motion,width,flipped]);
 const start=useMemo(()=>'from' in motion.move?squareCenter(motion.move.from,width,flipped):dropOrigin,[motion,width,flipped,dropOrigin]);
 useEffect(()=>{
  let active=true;
  const fallback=setTimeout(()=>{if(active)setReduced(v=>v??false);},120);
  void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(active)setReduced(v);}).catch(()=>{if(active)setReduced(false);});
  const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
  return ()=>{active=false;clearTimeout(fallback);sub.remove();};
 },[]);
 useEffect(()=>{
  if('from' in motion.move)return;
  let active=true,settled=false;
  const lower=(piece.side==='sente')!==flipped;
  const fallback={x:6+(HAND_KINDS.indexOf(motion.move.drop)+.5)*(width-12)/7,y:lower?width+size:-size};
  const settle=(point:BoardPoint)=>{if(active&&!settled){settled=true;setDropOrigin(point);}};
  const timeout=setTimeout(()=>settle(fallback),150);
  const boardOrigin=new Promise<BoardPoint|null>(resolve=>{if(!frameRef.current){resolve(null);return;}frameRef.current.measureInWindow((x,y,w,h)=>resolve(w>0&&h>0?{x,y}:null));});
  void Promise.all([getDropOrigin(piece.side,motion.move.drop),boardOrigin]).then(([hand,board])=>settle(hand&&board?{x:hand.x-board.x,y:hand.y-board.y}:fallback)).catch(()=>settle(fallback));
  return ()=>{active=false;clearTimeout(timeout);};
 },[motion,width,flipped,frameRef,getDropOrigin,piece.side,size]);
 useEffect(()=>{
  if(reduced===null)return;
  if(reduced){onComplete(motion.id);return;}
  if(!start)return;
  let active=true;progress.setValue(0);
  const animation=Animated.timing(progress,{toValue:1,duration:CPU_MOVE_DURATION,easing:Easing.inOut(Easing.cubic),useNativeDriver:true});
  animation.start(({finished})=>{if(active&&finished)onComplete(motion.id);});
  return ()=>{active=false;animation.stop();};
 },[motion.id,start,reduced,progress,onComplete]);
 if(!start||reduced===true)return null;
 const recovery=motion.before.position.board[motion.move.to]?.side===piece.side;
 const color=recovery?colors.orange:colors.green;
 return <View testID="cpu-move-animation" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
  <Svg width={width} height={width} style={StyleSheet.absoluteFill}>
   <Line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={2} strokeDasharray="4 4" opacity={.45}/>
   <Circle cx={start.x} cy={start.y} r={size*.27} fill="none" stroke={color} strokeWidth={2} opacity={.6}/>
   <Circle cx={end.x} cy={end.y} r={size*.36} fill="none" stroke={color} strokeWidth={2} opacity={.6}/>
  </Svg>
  <Animated.View testID="cpu-moving-piece" style={{position:'absolute',left:0,top:0,width:pieceSize,height:pieceSize,transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[start.x-pieceSize/2,end.x-pieceSize/2]})},{translateY:progress.interpolate({inputRange:[0,1],outputRange:[start.y-pieceSize/2,end.y-pieceSize/2]})},{scale:progress.interpolate({inputRange:[0,.5,1],outputRange:[1,1.12,1]})}]}}>
   <PieceView piece={piece} size={pieceSize} reversed={(piece.side==='gote')!==flipped}/>
  </Animated.View>
 </View>;
}
