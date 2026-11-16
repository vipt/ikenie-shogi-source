import {useCallback,useEffect,useRef} from 'react';
import {setAudioModeAsync,useAudioPlayer} from 'expo-audio';
import type {Game} from '../game/engine';
import {isNewCommittedMove} from '../game/presentation';

export function useMoveSound(game:Game,ready:boolean,enabled:boolean,foreground:boolean,volume:number){
  const player=useAudioPlayer(require('../../assets/audio/piece-move.wav'));
  const previous=useRef<{game:Game;ready:boolean}|null>(null);
  const sequence=useRef(0);
  const audioReady=useRef<Promise<void>>(Promise.resolve());
  useEffect(()=>{
    audioReady.current=setAudioModeAsync({playsInSilentMode:false,interruptionMode:'mixWithOthers',shouldPlayInBackground:false,allowsRecording:false}).catch(()=>undefined);
  },[player]);
  const playAtVolume=useCallback((percent:number)=>{
    const id=++sequence.current;
    if(!foreground||percent<=0)return;
    void audioReady.current.then(()=>{
      if(id!==sequence.current)return;
      player.volume=Math.max(0,Math.min(100,percent))/100;
      // Queue seek before play without delaying play behind the async bridge response.
      void player.seekTo(0).catch(()=>undefined);
      player.play();
    }).catch(()=>undefined);
  },[foreground,player]);
  useEffect(()=>{
    const before=previous.current;previous.current={game,ready};++sequence.current;
    if(!enabled||!foreground||volume===0){player.pause();return;}
    if(ready&&before?.ready&&isNewCommittedMove(before.game,game)){
      playAtVolume(volume);
    }
    return ()=>{sequence.current++;};
  },[game,ready,enabled,foreground,player,volume,playAtVolume]);
  return playAtVolume;
}
