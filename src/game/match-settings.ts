import {bookSupported} from './book-rules';
import {SIDE_LABEL,opposite,type Game,type Side} from './engine';
import {cpuLevel,cpuLevelProfile,legacyDifficulty,type CpuLevel} from './cpu-levels';
import type {Settings} from './persistence';
export const humanSide=(settings:Settings):Side=>settings.humanSide??'sente';
export function cpuLevelFor(settings:Settings,side:Side):CpuLevel {
 if(settings.players)return settings.players[side].level;
 return settings.mode==='watch' ? settings.watchCpuLevels?.[side]??cpuLevel(settings) : cpuLevel(settings);
}
export const cpuSearchProfile=(settings:Settings,side:Side)=>cpuLevelProfile(cpuLevelFor(settings,side));
export const isCpuSide=(settings:Settings,side:Side)=>settings.players?settings.players[side].kind==='cpu':settings.mode==='watch'||settings.mode==='cpu'&&side!==humanSide(settings);
export const isCpuTurn=(game:Game,settings:Settings)=>!game.result&&isCpuSide(settings,game.position.turn);
/** Return to immediately before the player's last move, retaining a CPU opening move. */
export function undoPlies(game:Game,settings:Settings):number {
 if(settings.mode!=='cpu')return game.log.length?1:0;
 for(let i=game.log.length-1;i>=0;i--)if(game.log[i]!.side===humanSide(settings))return game.log.length-i;
 return 0;
}
export function cpuMatchDescription(settings:Settings):string {
 if(settings.mode==='watch')return `先手 Lv.${cpuLevelFor(settings,'sente')} / 後手 Lv.${cpuLevelFor(settings,'gote')}`;
 if(settings.mode==='cpu')return `あなた：${SIDE_LABEL[humanSide(settings)]} / CPU Lv.${cpuLevelFor(settings,opposite(humanSide(settings)))}`;
 return '';
}

export type PlayerSettings={kind:'human'|'cpu';level:CpuLevel};
export type Players=Record<Side,PlayerSettings>;
export function playerFor(settings:Settings,side:Side):PlayerSettings {
 return settings.players?.[side]??{kind:isCpuSide(settings,side)?'cpu':'human',level:isCpuSide(settings,side)?cpuLevelFor(settings,side):settings.watchCpuLevels?.[side]??cpuLevel(settings)};
}
/** Keep the legacy game flags derived from the two player settings. */
export function withPlayers(settings:Settings,players:Players):Settings {
 const sente=players.sente.kind==='cpu',gote=players.gote.kind==='cpu';
 const mode=sente&&gote?'watch':sente||gote?'cpu':'local';
 const human=mode==='cpu'?(sente?'gote':'sente'):humanSide(settings);
 const level=mode==='cpu'?players[opposite(human)].level:cpuLevel(settings);
 return {...settings,players:{sente:{...players.sente},gote:{...players.gote}},mode,humanSide:human,cpuLevel:level,difficulty:legacyDifficulty(level),watchCpuLevels:{sente:players.sente.level,gote:players.gote.level}};
}
export const preparePlayers=(settings:Settings)=>withPlayers(settings,{sente:playerFor(settings,'sente'),gote:playerFor(settings,'gote')});
export function updatePlayer(settings:Settings,side:Side,patch:Partial<PlayerSettings>):Settings {
 const players={sente:playerFor(settings,'sente'),gote:playerFor(settings,'gote')};
 return withPlayers(settings,{...players,[side]:{...players[side],...patch}});
}

export function recoveryEnabled(settings:Settings,side:Side):boolean {
 const rule=settings.rules.selfCapture??'both';return rule==='both'||rule===side;
}
export function updateRecovery(settings:Settings,side:Side,enabled:boolean):Settings {
 const sente=side==='sente'?enabled:recoveryEnabled(settings,'sente');
 const gote=side==='gote'?enabled:recoveryEnabled(settings,'gote');
 const selfCapture=sente&&gote?'both':sente?'sente':gote?'gote':'none';
 return {...settings,rules:{...settings.rules,selfCapture},book:settings.book&&bookSupported({...settings.rules,selfCapture})};
}
