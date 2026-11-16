import {newSession} from './src/game/session';
import {ArchiveScreen} from './src/ui/ArchiveScreen';
import {bookSupported} from './src/game/book-rules';
import {stageCpuMove,completeCpuMove,type AnimatedTimeline,type BoardPoint} from './src/game/cpu-animation';
import {replaceGame,takeBackHistory,goForwardHistory} from './src/game/history';
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import {
  createGame, DEFAULT_MOVE_LIMIT, MAX_MOVE_LIMIT, validMoveLimit, HAND_KINDS, isInCheck, LABELS, legalMoves, opposite, play, resign, SIDE_LABEL,
  type Game, type HandKind, type Move, type Side,
} from './src/game/engine';
import {humanSide,cpuLevelFor,isCpuTurn,undoPlies,cpuMatchDescription,playerFor,updatePlayer,recoveryEnabled,updateRecovery} from './src/game/match-settings';
import {CpuLevelSelector} from './src/ui/CpuLevelSelector';
import { startCpuSearch, startPositionEvaluation, NATIVE_AVAILABLE, RECOVERY_LABELS } from './src/game/mobile-cpu';
import licenseText from './src/game/licenses';
import { DEFAULT_SETTINGS, loadGame, saveGame, archiveGame, type Settings } from './src/game/storage';
import {newGameSettings} from './src/game/persistence';
import { Board } from './src/ui/Board';
import { PieceView } from './src/ui/PieceView';
import { colors, serif } from './src/ui/theme';
import {advantagePercent,resultPercent,selfCaptureCounts} from './src/game/presentation';
import {useMoveSound} from './src/ui/useMoveSound';
import {EvaluationBar} from './src/ui/EvaluationBar';
import appConfig from './app.json';
import {formatSharedRecord} from './src/game/shared-record';

type Selection = { square: number } | { hand: HandKind } | null;
type Dialog = 'preferences' | 'rules' | 'new' | 'resign' | 'history' | 'archives' | 'licenses' | null;
const ruleDescriptions = {
  enemy: '玉は味方の駒を回収できません。相手の駒は取れます。',
  none: '玉は空きマスにだけ移動できます。相手の駒も取れません。',
  all: '玉も味方の駒を回収できます。相手の駒も取れます。',
};
const reasons = { mate: '詰み', 'no-moves': '指せる手がありません', repetition: '千日手', 'perpetual-check': '連続王手の千日手', resign: '投了', 'move-limit': '手数上限超過' };

function Button({ children, onPress, secondary = false, disabled = false, testID }: {
  children: string; onPress: () => void; secondary?: boolean; disabled?: boolean; testID?: string;
}) {
  return <Pressable accessibilityRole="button" testID={testID} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, disabled && { opacity: 0.35 }, pressed && { opacity: 0.75 }]}>
    <Text style={[styles.buttonText, secondary && { color: colors.green }]}>{children}</Text>
  </Pressable>;
}

const PRIVACY_POLICY_URL = 'https://vipt.github.io/ikenie-shogi/privacy.html';
const SOURCE_CODE_URL = `https://github.com/vipt/ikenie-shogi-source/releases/tag/v${appConfig.expo.version}`;

function SourceCodeLink() {
  const [failed, setFailed] = useState(false);
  async function openSource() {
    setFailed(false);
    try { await Linking.openURL(SOURCE_CODE_URL); }
    catch { setFailed(true); }
  }
  return <>
    <Pressable testID="open-source-code" accessibilityRole="link" accessibilityLabel="このバージョンのソースコード" accessibilityHint="GitHubをブラウザーで開きます" onPress={() => { void openSource(); }}
      style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && { opacity: 0.75 }]}>
      <Text style={[styles.buttonText, { color: colors.green }]}>ソースコード（v{appConfig.expo.version}）↗</Text>
    </Pressable>
    {failed && <Text accessibilityLiveRegion="polite" style={styles.bodyText}>ブラウザーを開けませんでした。次のURLをブラウザーに入力してください。</Text>}
    <Text testID="source-code-url" selectable style={styles.caption}>{SOURCE_CODE_URL}</Text>
  </>;
}

function PrivacyPolicyLink() {
  const [failed, setFailed] = useState(false);
  async function openPolicy() {
    setFailed(false);
    try { await Linking.openURL(PRIVACY_POLICY_URL); }
    catch { setFailed(true); }
  }
  return <>
    <Pressable testID="open-privacy-policy" accessibilityRole="link" accessibilityLabel="プライバシーポリシー" accessibilityHint="ブラウザーで開きます" onPress={() => { void openPolicy(); }}
      style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && { opacity: 0.75 }]}>
      <Text style={[styles.buttonText, { color: colors.green }]}>プライバシーポリシー ↗</Text>
    </Pressable>
    {failed && <View><Text accessibilityLiveRegion="polite" style={styles.bodyText}>ブラウザーを開けませんでした。次のURLをブラウザーに入力してください。</Text><Text selectable style={styles.textLink}>{PRIVACY_POLICY_URL}</Text></View>}
  </>;
}

type DisplayPreferences = Pick<Settings,'moveSound'|'moveSoundVolume'|'showEvaluation'|'sound'>;
function DisplaySettings({value,onChange,onPreview}:{value:DisplayPreferences;onChange:(patch:Partial<DisplayPreferences>)=>void;onPreview:(volume:number)=>void}){
  return <>
    <View style={styles.switchRow}><Text style={styles.bodyText}>形勢をパーセント表示</Text><Switch testID="show-evaluation-switch" accessibilityLabel="形勢をパーセント表示" value={value.showEvaluation} onValueChange={showEvaluation=>onChange({showEvaluation})} trackColor={{true:colors.green}} /></View>
    <Text style={styles.caption}>CPUの評価値から換算した有利さの目安です。実測した勝率ではありません。</Text>
    <Text style={styles.caption}>探索局面数は今回の解析で調べた延べ局面数です。同じ局面の再探索も含み、着手や解析の再開始でリセットします。探索深さは読みの深さの目安です。</Text>
    <View style={styles.switchRow}><Text style={styles.bodyText}>着手時の駒音</Text><Switch testID="move-sound-switch" accessibilityLabel="着手時の駒音" value={value.moveSound} onValueChange={moveSound=>onChange({moveSound})} trackColor={{true:colors.green}} /></View>
    <View style={styles.switchRow}>
      <Text style={styles.bodyText}>駒音の音量</Text><Text testID="move-sound-volume" style={styles.bodyText}>{value.moveSoundVolume}%</Text>
    </View>
    <View style={styles.modalActions}>
      <Button secondary testID="sound-volume-down" disabled={!value.moveSound||value.moveSoundVolume===0} onPress={()=>onChange({moveSoundVolume:Math.max(0,value.moveSoundVolume-5)})}>− 小さく</Button>
      <Button secondary testID="sound-volume-up" disabled={!value.moveSound||value.moveSoundVolume===100} onPress={()=>onChange({moveSoundVolume:Math.min(100,value.moveSoundVolume+5)})}>＋ 大きく</Button>
    </View>
    <Button secondary testID="sound-preview" disabled={!value.moveSound||value.moveSoundVolume===0} onPress={()=>onPreview(value.moveSoundVolume)}>駒音を試す</Button>
    <Text style={styles.caption}>端末のメディア音量も音の大きさに影響します。聞こえないときは、端末の音量も確認してください。</Text>
    <View style={styles.switchRow}><Text style={styles.bodyText}>操作時の振動</Text><Switch accessibilityLabel="操作時の振動" value={value.sound} onValueChange={sound=>onChange({sound})} trackColor={{true:colors.green}} /></View>
  </>;
}

function GameScreenAwake() {
  useKeepAwake('meguru-active-game', { suppressDeactivateWarnings: true });
  return null;
}

function AppContent() {
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 900;
  const boardWidth = Math.max(225, Math.min(wide ? 486 : 432, width - 52));
  const [timeline,setTimeline]=useState<AnimatedTimeline>(()=>replaceGame(createGame(DEFAULT_SETTINGS.rules)));
  const {game,redo,cpuAnimation}=timeline;
  const [session,setSession]=useState(newSession);
  const [starting,setStarting]=useState(false);
  const startingRef=useRef(false);
  const modalScroll=useRef<React.ComponentRef<typeof ScrollView>>(null);
  const animationSequence=useRef(0);
  const handRefs=useRef<Record<string,React.ComponentRef<typeof View>|null>>({});
  const finishCpuAnimation=useCallback((id:number)=>setTimeline(current=>completeCpuMove(current,id)),[]);
  const getDropOrigin=useCallback((side:Side,kind:HandKind)=>new Promise<BoardPoint|null>(resolve=>{const view=handRefs.current[side+'-'+kind];if(!view){resolve(null);return;}view.measureInWindow((x,y,w,h)=>resolve(w>0&&h>0?{x:x+w/2,y:y+h/2}:null));}),[]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<Settings>(DEFAULT_SETTINGS);
  const [moveLimitText,setMoveLimitText]=useState(String(DEFAULT_MOVE_LIMIT));
  const moveLimitValue=/^\d+$/.test(moveLimitText)?Number(moveLimitText):NaN;
  const moveLimitValid=validMoveLimit(moveLimitValue);
  const [ready, setReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [promotion, setPromotion] = useState<Move[] | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState(false);
  const [evaluation,setEvaluation]=useState<{game:Game;cp:number|null;failed:boolean;depth:number;nodes:number}|null>(null);
  const [paused,setPaused]=useState(true);
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const [cpuFailed,setCpuFailed]=useState(false);
  const gameId=useRef('game-'+Date.now());
  const position = game.position;
  const cpuTurn = isCpuTurn(game,settings);
  const cpuThinking=hasStarted&&cpuTurn&&!cpuAnimation&&!starting&&foreground&&!cpuFailed&&!(settings.mode==='watch'&&paused)&&!dialog&&!promotion;
  const available = useMemo(() => game.result ? [] : legalMoves(position), [position, game.result]);
  const check = useMemo(() => isInCheck(position, position.turn), [position]);
  const targets = useMemo(() => selection ? available.filter(m => 'square' in selection
    ? 'from' in m && m.from === selection.square
    : 'drop' in m && m.drop === selection.hand) : [], [selection, available]);
  const recoveryCounts=useMemo(()=>selfCaptureCounts(game),[game]);
  const selfCaptures = recoveryCounts.sente+recoveryCounts.gote;
  const lastMove = game.log[game.log.length - 1]?.move;
  const previewMoveSound=useMoveSound(game,ready,settings.moveSound,foreground,settings.moveSoundVolume);
  const percentages=game.result?resultPercent(game.result):evaluation?.game===game&&evaluation.cp!==null?advantagePercent(evaluation.cp):null;
  const evaluationFailed=evaluation?.game===game&&evaluation.failed;
  useEffect(()=>{
    if(!ready||!hasStarted||!settings.showEvaluation||!foreground||game.result||dialog||promotion||cpuThinking||cpuAnimation)return;
    let active=true;
    setEvaluation(previous=>({game,cp:previous?.game===game?previous.cp:null,depth:0,nodes:0,failed:false}));
    const request=startPositionEvaluation(game,settings,gameId.current,{continuous:true,onUpdate:update=>{
      if(active)setEvaluation({game,cp:update.cp,depth:update.depth,nodes:update.nodes,failed:false});
    }});
    void request.result.catch(()=>{if(active)setEvaluation({game,cp:null,depth:0,nodes:0,failed:true});});
    return ()=>{active=false;request.cancel();};
  },[ready,hasStarted,game,foreground,dialog,promotion,cpuThinking,cpuAnimation,settings.showEvaluation,settings.cpuEngine,settings.difficulty,settings.model,settings.book,settings.rules,settings.cpuLevel,settings.humanSide,settings.watchCpuLevels,settings.players]);

  useEffect(() => {
    let active = true;
    loadGame().then(saved => {
      if (!active) return;
      if (saved) { setTimeline({game:saved.game,redo:saved.redo??[]}); setSettings(saved.settings); setDraft(saved.settings);setSession(saved.session); setHasStarted(true); }
      else { setDialog('new'); }
    }).catch(() => { if (active) { setNotice('保存した対局を読み込めませんでした。新しい対局を始められます。'); setDialog('new'); } })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !hasStarted) return;
    let active = true;
    saveGame(game, settings, redo, session).then(() => { if (active) setSaveError(false); })
      .catch(() => { if (active) setSaveError(true); });
    return () => { active = false; };
  }, [game, settings, ready, hasStarted, redo, session]);

  useEffect(()=>{
    const sub=AppState.addEventListener('change',state=>{setForeground(state==='active');if(state!=='active')setPaused(true);});
    return ()=>sub.remove();
  },[]);
  useEffect(()=>{
    if(cpuAnimation&&(!foreground||dialog||promotion||settings.mode==='watch'&&paused))finishCpuAnimation(cpuAnimation.id);
  },[cpuAnimation,foreground,dialog,promotion,settings.mode,paused,finishCpuAnimation]);
  useEffect(() => {
    if (!ready || !cpuThinking) return;
    let active=true;let search:ReturnType<typeof startCpuSearch>|undefined;
    setEvaluation(previous=>({game,cp:previous?.game===game?previous.cp:null,depth:0,nodes:0,failed:false}));
    const timer=setTimeout(()=>{
      search=startCpuSearch(game,settings,gameId.current,settings.showEvaluation?update=>{
        if(active)setEvaluation({game,cp:update.cp,depth:update.depth,nodes:update.nodes,failed:false});
      }:undefined);
      void search.result.then(move=>{
        if(active){const id=++animationSequence.current;setTimeline(current=>stageCpuMove(current,game,move,id));}
      }).catch(error=>{if(active){console.warn('CPU search failed',error);setCpuFailed(true);setPaused(true);setNotice('CPUの着手に失敗しました。再試行できます。');}});
    },settings.mode==='watch'?350:250);
    return ()=>{active=false;clearTimeout(timer);search?.cancel();};
  }, [ready,cpuThinking,game,settings]);

  function vibrate() {
    if (settings.sound && Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
  }
  function commit(move: Move) {
    try {
      setTimeline(replaceGame(play(game, move))); setSelection(null); setPromotion(null); setNotice(''); vibrate();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'その手は指せません。'); }
  }
  function tapSquare(square: number) {
    if (startingRef.current || cpuTurn || game.result || !ready || !hasStarted) return;
    const choices = targets.filter(m => m.to === square);
    if (choices.length > 1) { setPromotion(choices); return; }
    if (choices[0]) { commit(choices[0]); return; }
    if (position.board[square]?.side === position.turn) {
      setSelection(selection && 'square' in selection && selection.square === square ? null : { square });
      setNotice(''); vibrate();
    } else { setSelection(null); setNotice(''); }
  }
  function openNew() {
    if(startingRef.current)return;setNotice('');
    setDraft(newGameSettings(settings));setMoveLimitText(String(settings.rules.moveLimit??DEFAULT_MOVE_LIMIT)); setDialog('new');
  }
  async function startGame() {
    if(!moveLimitValid||startingRef.current)return;
    startingRef.current=true;setStarting(true);
    try{if(hasStarted)await archiveGame(game,settings,session);}catch{setNotice('履歴を保存できなかったため、開始していません。もう一度お試しください。');startingRef.current=false;setStarting(false);return;}
    startingRef.current=false;setStarting(false);setSession(newSession());
    const nextSettings=newGameSettings({...draft,rules:{...draft.rules,moveLimit:moveLimitValue}});
    gameId.current='game-'+Date.now();setPaused(false);setCpuFailed(false);
    setSettings(nextSettings); setTimeline(replaceGame(createGame(nextSettings.rules))); setDialog(null);
    setHasStarted(true);
    setSelection(null); setPromotion(null); setNotice('');
  }
  function takeBack() {
    if(startingRef.current)return;
    const plies=undoPlies(game,settings);if(!plies)return;
    setPaused(true);setCpuFailed(false);gameId.current='undo-'+Date.now();
    setTimeline(current=>takeBackHistory(current,plies)); setSelection(null); setPromotion(null); setNotice('');
  }
  function goForward() {
    if(startingRef.current)return;
    if(!redo.length)return;
    setPaused(true);setCpuFailed(false);gameId.current='redo-'+Date.now();
    setTimeline(current=>goForwardHistory(current));setSelection(null);setPromotion(null);setNotice('');
  }
  async function shareRecord() {
    try { await Share.share({ message: formatSharedRecord(game,settings,session.startedAt) }); }
    catch { setNotice('この環境では棋譜の共有を開けませんでした。'); }
  }

  function HandTray({ side }: { side: Side }) {
    const active = hasStarted && side === position.turn && !game.result;
    const total = Object.values(position.hands[side]).reduce((a, b) => a + b, 0);
    return <View style={[styles.handTray, !wide && { paddingVertical: 6 }, active && styles.activeTray, { width: boardWidth }]}>
      <View style={styles.playerLine}>
        <View style={styles.row}>
          <View style={[styles.playerMark, side === 'gote' && styles.playerMarkGote]}><Text style={[styles.playerMarkText, side === 'gote' && { color: colors.green }]}>{side === 'sente' ? '先' : '後'}</Text></View>
          <Text testID={'player-'+side} style={styles.playerName}>{settings.mode === 'watch' ? SIDE_LABEL[side]+'CPU · Lv.'+cpuLevelFor(settings,side) : settings.mode === 'cpu' ? (side === humanSide(settings) ? 'あなた（'+SIDE_LABEL[side]+'）' : SIDE_LABEL[side]+'CPU · Lv.'+cpuLevelFor(settings,side)) : SIDE_LABEL[side]}</Text>
          {active && <View style={styles.turnBadge}><Text style={styles.turnBadgeText}>手番</Text></View>}
        </View>
      </View>
      <View testID={'hand-stats-'+side} style={styles.handStats}>
        <Text testID={'hand-total-'+side} style={styles.caption}>持ち駒 <Text style={{ color: colors.ink }}>{total}</Text> 枚</Text>
        <Text testID={side+'-recovery-count'} accessibilityLabel={SIDE_LABEL[side]+' 自駒回収 '+recoveryCounts[side]+'回'} style={styles.caption}>自駒回収 <Text style={{color:colors.ink}}>{recoveryCounts[side]}</Text>回</Text>
      </View>
      <View style={styles.handPieces}>
        {HAND_KINDS.map(kind => {
          const count = position.hands[side][kind];
          const selected = active && selection && 'hand' in selection && selection.hand === kind;
          return <Pressable key={kind} ref={node=>{handRefs.current[side+'-'+kind]=node;}} testID={`hand-${side}-${kind}`} accessibilityRole="button"
            accessibilityLabel={`${SIDE_LABEL[side]} 持ち駒 ${LABELS[kind]} ${count}枚`}
            accessibilityState={{ selected: !!selected, disabled: !active || !count || !!cpuTurn }}
            disabled={!active || !count || !!cpuTurn}
            onPress={() => { setSelection(selected ? null : { hand: kind }); setNotice(''); vibrate(); }}
            style={[styles.handSlot, !wide && { minHeight: 32 }, count === 0 && { opacity: 0.28 }, selected && { backgroundColor: colors.greenLight }]}>
            <Text allowFontScaling={false} style={styles.handCharacter}>{LABELS[kind]}</Text>
            <Text allowFontScaling={false} style={styles.handCount}>{count || '–'}</Text>
          </Pressable>;
        })}
      </View>
    </View>;
  }

  const statusTitle = !hasStarted ? '対局開始前' : game.result ? (game.result.winner ? `${SIDE_LABEL[game.result.winner]}の勝ち` : '引き分け')
    : cpuAnimation ? SIDE_LABEL[position.turn]+'CPUが指しています' : settings.mode==='watch'&&paused ? 'CPU対局を一時停止中' : cpuThinking ? (settings.mode==='watch'?SIDE_LABEL[position.turn]+'CPUが考えています':'こまめが考えています') : cpuFailed?'CPUを停止しています':SIDE_LABEL[position.turn]+'の番です';
  const resultDetail=game.result?(game.result.reason==='move-limit'?`手数上限（${settings.rules.moveLimit}手）を超過`:reasons[game.result.reason])+' · '+game.log.length+'手まで':'';
  const statusHint = !hasStarted ? '対局設定を選び、「対局をはじめる」を押してください。' : game.result ? resultDetail : settings.mode==='watch'&&paused?'「再開」でCPU同士の対局を続けます。':check ? (cpuTurn?'王手です。':'王手です。玉を守る手を選んでください。')
    : selection ? targets.length ? '緑のマスへ移動。橙のマスは味方を回収。' : 'この駒は、いま動かせません。'
      : cpuTurn ? 'どの駒をめぐらせよう？' : '駒を選んで、移動先をタップ。';
  const topSide: Side = settings.flipped ? 'sente' : 'gote';

  if (!ready) return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.green} /><Text style={styles.caption}>盤を用意しています…</Text></SafeAreaView>;

  return <SafeAreaView style={styles.screen}>
    {ready && hasStarted && foreground && !game.result && !dialog && !cpuFailed && (settings.mode !== 'watch' || !paused) && <GameScreenAwake />}
    <StatusBar style="dark" />
    {dialog==='archives'?<ArchiveScreen snapshot={{game:cpuAnimation?.after??game,settings,session}} onClose={()=>setDialog(null)}/>:<ScrollView testID="game-scroll" contentContainerStyle={styles.page}>
      <View style={[styles.header, !wide && { paddingTop: 12, paddingBottom: 14, marginBottom: 16 }]}>
        <View style={styles.row}>
          <View style={styles.logo}><Text style={styles.logoText}>生</Text><Text style={styles.logoArrow}>↻</Text></View>
          <View><Text style={styles.brand}>生贄将棋</Text><Text style={styles.brandSub}>味方の駒に、もう一度出番を。</Text></View>
        </View>
        <View style={styles.row}><Pressable testID="open-preferences" accessibilityRole="button" accessibilityLabel="アプリの設定" onPress={()=>setDialog('preferences')} style={styles.helpButton}><Text style={styles.preferenceButton}>設定</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="遊び方を開く" onPress={() => setDialog('rules')} style={styles.helpButton}><Text style={styles.helpText}>？</Text></Pressable></View>
      </View>

      <View style={[styles.layout, !wide && { flexDirection: 'column', alignItems: 'center', gap: 24 }]}>
        <View style={[styles.playArea, { width: boardWidth + 20 }]}>
          <View style={[styles.matchHeader, { width: boardWidth }]}>
            <Pressable testID="open-game-settings" accessibilityRole="button" accessibilityLabel="対局設定を開く" onPress={() => openNew()} style={styles.modeBadge}>
              <Text style={styles.modeText}>対局設定 <Text style={{ color: colors.muted }}>⌄</Text></Text>
            </Pressable>
            {!settings.showEvaluation&&<Text testID="header-move-number" style={styles.moveNumber}>{String(game.log.length).padStart(2, '0')} <Text style={styles.caption}>手目</Text></Text>}
          </View>
          <View style={{width:boardWidth,marginBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
            <View testID={game.result?'game-result':'match-summary'} accessibilityLiveRegion="polite" accessibilityLabel={game.result?statusTitle+'。'+resultDetail:undefined} style={{height:40*fontScale,flex:1,justifyContent:'center'}}>
              {game.result?<><Text numberOfLines={1} style={styles.resultText}>{statusTitle}</Text><Text numberOfLines={1} style={styles.tiny}>{resultDetail}</Text></>:<Text testID="current-move-limit" numberOfLines={1} style={styles.tiny}>{settings.rules.moveLimit??DEFAULT_MOVE_LIMIT}手を超えたら引き分け</Text>}
            </View>
            <Pressable testID="open-archives" accessibilityRole="button" onPress={()=>{setPaused(true);setNotice('');setDialog('archives');}} style={{paddingVertical:10,paddingHorizontal:8}}><Text style={styles.textLink}>対局履歴</Text></Pressable>
          </View>
          {settings.showEvaluation&&<View testID="evaluation-panel" style={[styles.evaluationPanel,{width:boardWidth}]}>
            <View style={styles.evaluationHeading}><Text style={styles.caption}>形勢の目安</Text><Text style={styles.tiny}>{!hasStarted?'開始前':game.result?'対局終了':evaluationFailed?'評価できません':!percentages?'計算中…':cpuAnimation?'着手中':evaluation?.game===game?'解析中':''}</Text></View>
            <View style={styles.evaluationHeading}>
              <Text testID="sente-percent" style={styles.evaluationText}>先手 {percentages?percentages.sente+'%':'—'}</Text>
              <View testID="evaluation-last-move" style={styles.evaluationLastMove}>
                <Text testID="evaluation-move-number" style={styles.evaluationMoveNumber}>{game.log.length}手目</Text>
                <Text testID="last-move-label" accessibilityLabel={'直前の手：'+(game.log.at(-1)?.label??'まだ指されていません')} numberOfLines={2} style={[styles.evaluationMoveLabel,{height:32*fontScale}]}>{game.log.at(-1)?.label??'開始前'}</Text>
              </View>
              <Text testID="gote-percent" style={styles.evaluationText}>後手 {percentages?percentages.gote+'%':'—'}</Text>
            </View>
            <EvaluationBar percent={percentages?.sente??null} />
            <View testID="evaluation-stats" style={{flexDirection:'row',justifyContent:'space-between',gap:6,marginTop:6}}>
              <Text testID="evaluation-nodes" numberOfLines={1} style={[styles.caption,{flex:1}]}>探索局面数 {evaluationFailed||game.result?'—':(evaluation?.game===game?evaluation.nodes:0).toLocaleString('ja-JP')}</Text>
              <Text testID="evaluation-depth" numberOfLines={1} style={styles.caption}>探索深さ {evaluation?.game===game&&!game.result&&!evaluationFailed&&evaluation.depth>0?evaluation.depth:'—'}</Text>
            </View>
          </View>}
          <HandTray side={topSide} />
          <View style={[styles.boardSpace, !wide && { marginTop: 8, marginBottom: 14 },{zIndex:cpuAnimation?2:0}]}><Board position={position} width={boardWidth} flipped={settings.flipped}
            selected={selection && 'square' in selection ? selection.square : null} moves={targets}
            lastMove={lastMove} checked={check} cpuAnimation={cpuAnimation} onAnimationComplete={finishCpuAnimation} getDropOrigin={getDropOrigin} onSquare={tapSquare} disabled={!hasStarted || !!cpuTurn || !!game.result} /></View>
          <HandTray side={opposite(topSide)} />
          <View testID="game-status" accessibilityLiveRegion="polite" style={[styles.status, !wide && { paddingVertical: 12 }, { width: boardWidth }]}>
            <View style={styles.row}>{cpuThinking ? <ActivityIndicator size="small" color={colors.green} /> : <View style={[styles.statusDot, check && { backgroundColor: colors.red }]} />}
              <Text numberOfLines={1} style={[styles.statusTitle,game.result&&{color:colors.green},check&&!game.result&&{color:colors.red}]}>{statusTitle}</Text>
              {check && !game.result && <Text style={styles.checkTag}>王手</Text>}
            </View>
            <Text numberOfLines={2} style={[styles.statusHint,{height:36*fontScale}]}>{statusHint}</Text>
          </View>
          {settings.mode!=='local'&&<Text testID="cpu-engine-label" style={[styles.caption,{width:boardWidth,textAlign:'center',marginBottom:8}]}>{cpuMatchDescription(settings)} · {RECOVERY_LABELS[settings.rules.selfCapture??'both']}</Text>}
          {settings.mode==='watch'&&<View style={[styles.controls,{width:boardWidth,marginBottom:8}]}>
            <Button testID="toggle-autoplay" disabled={!hasStarted || !!game.result} onPress={()=>{setPaused(p=>!p);setCpuFailed(false);setNotice('');}}>{game.result?'対局終了':paused?'▶ 再開':'Ⅱ 一時停止'}</Button>
          </View>}
          {cpuFailed&&<Button testID="retry-cpu" onPress={()=>{setCpuFailed(false);setPaused(false);setNotice('');}}>CPUを再試行</Button>}
          {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
          {saveError && <Text style={styles.notice}>自動保存に失敗しました。アプリを閉じると対局が失われる可能性があります。</Text>}
          <View style={[styles.controls, { width: boardWidth }]}>
            <Button testID="undo-move" secondary disabled={!undoPlies(game,settings)} onPress={takeBack}>↶ 待った</Button>
            <Button testID="redo-move" secondary disabled={!redo.length} onPress={goForward}>↷ 進む</Button>
          </View>
          <View style={[styles.controls, { width: boardWidth }]}>
            <Button secondary onPress={() => { if(cpuAnimation)finishCpuAnimation(cpuAnimation.id);setSettings(s => ({ ...s, flipped: !s.flipped })); }}>⇅ 反転</Button>
            <Button secondary disabled={!hasStarted || !!game.result || settings.mode==='watch'} onPress={() => setDialog('resign')}>投了</Button>
          </View>
          <View style={[styles.bottomLine, { width: boardWidth }]}><Text style={styles.tiny}>{saveError ? '保存できていません' : '対局はこの端末に自動保存されます'}</Text><Pressable accessibilityRole="button" onPress={() => openNew()}><Text style={styles.textLink}>新しい対局 ↗</Text></Pressable></View>
        </View>

        <View style={[styles.sidebar, !wide && { width: boardWidth }]}>
          <View style={styles.featureCard}>
            <Text style={styles.eyebrow}>いつもの将棋に、ひとつの自由。</Text>
            <Text style={styles.featureTitle}>味方を取る。{wide ? '\n' : ''}次の一手が、広がる。</Text>
            <View style={styles.diagram}>
              <View style={styles.demoSquare}><PieceView piece={{ kind: 'R', side: 'sente', promoted: false }} size={43} /></View>
              <Text style={styles.diagramArrow}>→</Text>
              <View style={[styles.demoSquare, { backgroundColor: '#EBC18D' }]}><PieceView piece={{ kind: 'P', side: 'sente', promoted: false }} size={43} /></View>
              <Text style={styles.diagramArrow}>→</Text>
              <View style={styles.demoHand}><Text style={styles.demoHandPiece}>歩</Text><Text style={styles.tiny}>持ち駒へ</Text></View>
            </View>
            <Text style={styles.bodyText}>飛車で味方の歩を回収。{wide ? '\n' : ''}その歩を、次の攻めや守りに。</Text>
            <View style={styles.ruleNote}><Text style={styles.ruleNoteText}>{RECOVERY_LABELS[settings.rules.selfCapture??'both']+'。'+ruleDescriptions[settings.rules.kingCapture]}</Text></View>
            <Pressable accessibilityRole="button" onPress={() => setDialog('rules')}><Text style={styles.textLink}>遊び方とルールを見る →</Text></Pressable>
          </View>
          <View style={styles.legend}><View style={styles.row}><View style={[styles.legendDot, { backgroundColor: '#8AA57A' }]} /><Text style={styles.caption}>移動できる</Text></View><View style={styles.row}><View style={[styles.legendDot, { backgroundColor: '#DDA366' }]} /><Text style={styles.caption}>味方を回収</Text></View></View>
          <View style={styles.recordCard}>
            <View style={styles.recordHeading}><Text style={styles.cardTitle}>この対局のあゆみ</Text><Text style={styles.recoverCounter}>↻ 回収 {selfCaptures}回</Text></View>
            {game.log.length ? game.log.slice(-5).map((r, i) => <View style={styles.recordRow} key={game.log.length - Math.min(5, game.log.length) + i}>
              <Text style={styles.recordIndex}>{game.log.length - Math.min(5, game.log.length) + i + 1}</Text><Text style={[styles.recordText, r.selfCapture && { color: colors.orange }]}>{r.label}</Text>
            </View>) : <View style={styles.emptyRecord}><Text style={styles.emptyRecordMark}>一</Text><Text style={styles.caption}>最初の一手を、自由に。</Text></View>}
            <Pressable accessibilityRole="button" onPress={() => setDialog('history')} style={styles.recordFooter}><Text style={styles.textLink}>すべての棋譜を見る →</Text></Pressable>
          </View>
          <Text style={styles.sidebarFooter}>MEGURU SHOGI · めぐる、つながる。</Text>
        </View>
      </View>
    </ScrollView>}

    <Modal visible={(!!dialog&&dialog!=='archives') || !!promotion} transparent animationType="fade" onRequestClose={() => { if(startingRef.current)return;setDialog(null); setPromotion(null); }}>
      <View style={styles.modalBackdrop}><View style={[styles.modal, { maxHeight: '90%' }]}>
        <ScrollView ref={modalScroll} contentContainerStyle={styles.modalInner}>
          <View style={styles.modalHeading}><Text style={styles.modalTitle}>{promotion ? '成りますか？' : dialog === 'rules' ? '生贄将棋の遊び方' : dialog === 'preferences' ? '設定' : dialog === 'new' ? '新しい対局' : dialog === 'resign' ? '投了しますか？' : dialog === 'history' ? '対局の棋譜' : dialog==='licenses'?'使用ソフトウェア':statusTitle}</Text>
            <Pressable testID="close-dialog" accessibilityRole="button" accessibilityLabel="閉じる" disabled={starting} onPress={() => { setDialog(null); setPromotion(null); }} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
          </View>

          {notice&&dialog==='new'?<Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>:null}
          {promotion ? <>
            <Text style={styles.bodyText}>敵陣に入る・出る・敵陣内を動くとき、駒を成らせることができます。</Text>
            <View style={styles.modalActions}>
              <Button onPress={() => commit(promotion.find(m => 'promote' in m && m.promote)!)}>成る</Button>
              <Button secondary onPress={() => commit(promotion.find(m => 'promote' in m && !m.promote)!)}>成らない</Button>
            </View>
          </> : dialog === 'preferences' ? <>
            <DisplaySettings onPreview={previewMoveSound} value={settings} onChange={patch=>{setSettings(s=>({...s,...patch}));setDraft(d=>({...d,...patch}));}} />
            <PrivacyPolicyLink />
            <Button secondary testID="open-licenses" onPress={()=>setDialog('licenses')}>使用ソフトウェア・ライセンス</Button>
            <Button onPress={()=>setDialog(null)}>盤に戻る</Button>
          </> : dialog === 'new' ? <>
            <Text style={styles.caption}>先手・後手それぞれのプレイヤーを設定します。</Text>
            {(['sente','gote'] as const).map(side=>{
              const player=playerFor(draft,side);
              return <View key={side} testID={'player-settings-'+side} style={styles.playerSettings}>
                <Text style={styles.playerSettingsTitle}>{SIDE_LABEL[side]}</Text>
                <View style={styles.modalActions}>{(['human','cpu'] as const).map(kind=><Pressable key={kind} testID={side+'-player-'+kind} accessibilityRole="radio" accessibilityLabel={SIDE_LABEL[side]+'を'+(kind==='human'?'人間':'CPU')+'にする'} accessibilityState={{checked:player.kind===kind}} onPress={()=>setDraft(d=>updatePlayer(d,side,{kind}))} style={[styles.option,{flex:1},player.kind===kind&&styles.selectedOption]}>
                  <Text style={styles.optionTitle}>{kind==='human'?'人間':'CPU'} {player.kind===kind?'✓':''}</Text>
                </Pressable>)}</View>
                <View style={styles.switchRow}>
                  <Text style={styles.bodyText}>自駒を回収できる</Text>
                  <Switch testID={side+'-recovery-switch'} accessibilityLabel={SIDE_LABEL[side]+'の自駒回収を許可'} value={recoveryEnabled(draft,side)} onValueChange={enabled=>setDraft(d=>updateRecovery(d,side,enabled))} trackColor={{true:colors.green}} />
                </View>
                {player.kind==='cpu'?<>
                  <Text style={styles.fieldLabel}>CPUの強さ</Text>
                  <CpuLevelSelector idPrefix={side+'-cpu-level'} labelPrefix={SIDE_LABEL[side]+'CPUレベル'} value={player.level} onChange={level=>setDraft(d=>updatePlayer(d,side,{level}))} />
                </>:<Text style={styles.caption}>{SIDE_LABEL[side]}の駒を操作して対局します。</Text>}
              </View>;
            })}
            {draft.mode!=='local'&&<>
              {!NATIVE_AVAILABLE&&<Text style={styles.caption}>Web版は簡易CPUで動作します。</Text>}
              {NATIVE_AVAILABLE&&<>
                <View style={styles.switchRow}><Text style={styles.bodyText}>専用定跡を使う</Text><Switch testID="opening-book-switch" accessibilityLabel="専用定跡を使う" value={draft.book} disabled={!bookSupported(draft.rules)} onValueChange={book=>setDraft(d=>({...d,book}))} trackColor={{true:colors.green}} /></View>
                <Text style={styles.caption}>両者の回収がONのときに使えます。玉のルールに合う定跡から、複数の初手・手順を選びます。</Text>
              </>}
            </>}
            <Text style={styles.fieldLabel}>引き分けの基準手数</Text>
            <TextInput testID="move-limit-input" accessibilityLabel="引き分けの基準手数" value={moveLimitText} onChangeText={setMoveLimitText} keyboardType="number-pad" inputMode="numeric" maxLength={4} selectTextOnFocus style={{borderWidth:1,borderColor:colors.line,borderRadius:10,padding:12,fontSize:18,color:colors.ink,backgroundColor:colors.paper}} />
            <Text testID="move-limit-help" style={[styles.caption,!moveLimitValid&&{color:colors.red}]}>{moveLimitValid?`${moveLimitValue}手までは継続し、${moveLimitValue+1}手目で引き分け。詰みなどの決着を優先します。`:`1〜${MAX_MOVE_LIMIT}の整数を入力してください。`}</Text>
            <Text style={styles.fieldLabel}>玉が取れる駒</Text>
            {(['enemy', 'all'] as const).map(rule => <Pressable key={rule} testID={'king-capture-'+rule} accessibilityRole="radio" accessibilityState={{ checked: draft.rules.kingCapture === rule }} onPress={() => setDraft(d => ({ ...d, rules: { ...d.rules, kingCapture: rule }, book: d.book&&bookSupported({...d.rules,kingCapture:rule}) }))} style={[styles.option, draft.rules.kingCapture === rule && styles.selectedOption]}>
              <Text style={styles.optionTitle}>{rule === 'enemy' ? '相手の駒だけ' : '味方も相手も取れる（標準）'} {draft.rules.kingCapture === rule ? '✓' : ''}</Text>
            </Pressable>)}
            <Text style={styles.fieldLabel}>表示と音</Text><DisplaySettings onPreview={previewMoveSound} value={draft} onChange={patch=>setDraft(d=>({...d,...patch}))} />
            {game.log.length > 0 && <Text style={styles.caption}>現在の棋譜は対局履歴に残して、新しい対局を開始します。</Text>}
            <Button testID="start-game" disabled={!moveLimitValid||starting} onPress={()=>{void startGame();}}>{starting?'履歴を保存中…':'対局をはじめる'}</Button>
          </> : dialog === 'rules' ? <>
            <Text style={styles.ruleLead}>味方も、次の一手の力になる。</Text>
            {[
              ['01', '味方の駒を回収できる', '駒の通常の動きで味方のいるマスに進むと、その駒が自分の持ち駒になります。回収と打ち直しは、それぞれ1手です。'],
              ['02', '玉には、特別な制限', ruleDescriptions[settings.rules.kingCapture] + ' どの設定でも玉そのものは取れず、玉同士は隣り合えません。'],
              ['03', '成駒は、元の姿で持ち駒に', '敵味方どちらの成駒を取っても、成る前の駒として持ち駒になります。盤上では通常どおり成れます。'],
              ['04', '基本の禁じ手は、そのまま', '二歩、王手放置、打ち歩詰め、行き所のない駒は禁止です。指せるマスだけを表示します。詰みか投了で決着します。'],
              ['05', '手数の上限', `${settings.rules.moveLimit??DEFAULT_MOVE_LIMIT}手を超えたら引き分け。先手・後手それぞれの着手を1手と数えます。詰みなどによる決着を優先し、上限は新しい対局の設定で変更できます。自駒回収数は先手・後手別の累計回数です。`],
              ['06', '繰り返しと、このアプリの取り決め', '同じ局面が4回現れると千日手で引き分け。連続王手なら王手を続けた側の負けです。合法手がない側は負けとします。持将棋・入玉宣言の自動判定、持ち時間はありません。'],
            ].map(([n, title, body]) => <View key={n} style={styles.ruleItem}><Text style={styles.ruleNumber}>{n}</Text><View style={{ flex: 1 }}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.bodyText}>{body}</Text></View></View>)}
            <View style={styles.ruleNote}><Text style={styles.ruleNoteText}>まずは飛車を選び、目の前の味方の歩をタップ。橙色のマスが「回収」の目印です。</Text></View>
            <Button secondary onPress={()=>setDialog('licenses')}>使用ソフトウェア</Button>
            <Button onPress={() => setDialog(null)}>盤に戻る</Button>
          </> : dialog==='licenses' ? <>
            <Text style={styles.bodyText}>探索エンジン：やねうら王 V9.00 改造版。評価関数：Háo 2023-05-08 およびその追加学習版。本アプリはGPL v3以降に基づいて配布し、保証はありません。GPLの条件に従って複製・改変・再配布できます。</Text>
            <Text style={styles.bodyText}>このバージョンに対応するアプリ本体・改造エンジンのソースとビルド手順を、次のページから無料で入手できます。著作権表示と各素材のライセンスは配布ソースに含まれます。</Text>
            <SourceCodeLink />
            <Text selectable style={styles.caption}>{licenseText}</Text>
          </> : dialog === 'resign' ? <>
            <Text style={styles.bodyText}>{SIDE_LABEL[settings.mode === 'cpu' ? humanSide(settings) : position.turn]}の投了として対局を終了します。</Text>
            <View style={styles.modalActions}><Button secondary onPress={() => setDialog(null)}>続ける</Button><Button onPress={() => { setTimeline(replaceGame(resign(game, settings.mode === 'cpu' ? humanSide(settings) : position.turn))); setDialog(null); }}>投了する</Button></View>
          </> : dialog === 'history' ? <>
            <Text style={styles.caption}>{RECOVERY_LABELS[settings.rules.selfCapture??'both']+'。'+ruleDescriptions[settings.rules.kingCapture]}</Text>
            {!game.log.length && <Text style={styles.bodyText}>まだ指し手はありません。</Text>}
            {game.log.map((r, i) => <View key={i} style={styles.recordRow}><Text style={styles.recordIndex}>{i + 1}</Text><Text style={[styles.recordText, r.selfCapture && { color: colors.orange }]}>{r.label}</Text></View>)}
            {game.result && <Text style={styles.bodyText}>{statusTitle} · {reasons[game.result.reason]}</Text>}
            <Button disabled={!game.log.length} onPress={() => { void shareRecord(); }}>棋譜を共有</Button>
          </> : null}
        </ScrollView>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><AppContent /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.background },
  page: { width: '100%', maxWidth: 1060, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  header: { paddingTop: 25, paddingBottom: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 47, height: 49, backgroundColor: colors.green, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 5 },
  logoText: { color: '#F7F4E5', fontFamily: serif, fontSize: 28, marginTop: -4 },
  logoArrow: { position: 'absolute', bottom: -1, right: 4, color: '#D4DFAF', fontSize: 19 },
  brand: { color: colors.ink, fontFamily: serif, fontSize: 26, fontWeight: '700', letterSpacing: 2 },
  brandSub: { color: colors.muted, fontSize: 10, marginTop: 5, letterSpacing: 0.8 },
  helpButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  helpText: { color: colors.green, fontSize: 19 },
  preferenceButton:{color:colors.green,fontSize:12,fontWeight:'600'},
  evaluationPanel:{paddingBottom:12,gap:5},
  evaluationHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  evaluationLastMove:{flex:1,minWidth:0,alignItems:'center',paddingHorizontal:6,gap:2},
  evaluationMoveNumber:{fontSize:12,fontWeight:'700',lineHeight:18,color:colors.ink,fontVariant:['tabular-nums']},
  evaluationMoveLabel:{fontSize:11,lineHeight:16,color:colors.muted,textAlign:'center',alignSelf:'stretch'},
  evaluationText:{fontSize:14,fontWeight:'700',color:colors.ink,fontVariant:['tabular-nums']},
  evaluationTrack:{height:8,borderRadius:4,overflow:'hidden',flexDirection:'row',backgroundColor:colors.line},
  resultText:{color:colors.green,fontSize:15,lineHeight:20,fontWeight:'700'},
  layout: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 48 },
  playArea: { alignItems: 'flex-start' },
  matchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modeBadge: { backgroundColor: colors.greenLight, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 25 },
  modeText: { color: colors.green, fontWeight: '600', fontSize: 12 },
  moveNumber: { fontSize: 25, color: colors.ink, fontVariant: ['tabular-nums'], fontWeight: '500' },
  caption: { fontSize: 11, lineHeight: 18, color: colors.muted },
  handTray: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#EEEFE7', borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  playerSettings:{borderWidth:1,borderColor:colors.line,borderRadius:12,padding:12,gap:8,marginBottom:12},
  playerSettingsTitle:{fontSize:20,fontWeight:'700',color:colors.green},
  handStats:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',flexWrap:'wrap',columnGap:12,rowGap:2,marginBottom:4},
  activeTray: { backgroundColor: colors.paper, borderColor: '#CCD7C5' },
  playerLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  playerMark: { width: 25, height: 25, backgroundColor: colors.green, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  playerMarkGote: { backgroundColor: '#D9DFCF' },
  playerMarkText: { fontSize: 11, color: 'white', fontWeight: '600' },
  playerName: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  turnBadge: { backgroundColor: colors.greenLight, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  turnBadgeText: { color: colors.green, fontSize: 9 },
  handPieces: { flexDirection: 'row', gap: 4 },
  handSlot: { flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 6 },
  handCharacter: { color: colors.ink, fontFamily: serif, fontSize: 23, fontWeight: '600' },
  handCount: { color: colors.green, fontSize: 10, alignSelf: 'flex-end', paddingBottom: 5 },
  boardSpace: { marginTop: 12, marginBottom: 20 },
  status: { paddingVertical: 17, alignItems: 'center', gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  statusTitle: { color: colors.ink, fontSize: 15, lineHeight:22, fontWeight: '600' },
  checkTag: { color: colors.red, fontSize: 11, fontWeight: '700' },
  statusHint: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: 'center' },
  controls: { flexDirection: 'row', gap: 8 },
  button: { flexGrow: 1, minHeight: 45, borderRadius: 10, backgroundColor: colors.green, paddingVertical: 13, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  secondaryButton: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  buttonText: { color: colors.paper, fontSize: 13, fontWeight: '600' },
  bottomLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 18, flexWrap: 'wrap' },
  tiny: { color: colors.muted, fontSize: 9, lineHeight: 16 },
  textLink: { color: colors.green, fontSize: 11, lineHeight: 20, fontWeight: '600' },
  sidebar: { width: 312, paddingTop: 2, gap: 18 },
  featureCard: { backgroundColor: '#EAF0E2', borderRadius: 18, padding: 24, gap: 17 },
  eyebrow: { color: colors.green, fontSize: 10, letterSpacing: 0.7 },
  featureTitle: { color: colors.ink, fontFamily: serif, fontSize: 24, lineHeight: 38, fontWeight: '600', letterSpacing: 0.2 },
  diagram: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 6 },
  demoSquare: { width: 54, height: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.board, borderWidth: 1, borderColor: '#C5A568', borderRadius: 6 },
  diagramArrow: { color: colors.green, fontSize: 18 },
  demoHand: { alignItems: 'center', gap: 2 },
  demoHandPiece: { color: colors.green, fontFamily: serif, fontSize: 28, fontWeight: '600' },
  bodyText: { color: '#657164', fontSize: 12, lineHeight: 22 },
  ruleNote: { borderLeftWidth: 2, borderLeftColor: '#A0B48B', paddingLeft: 12, paddingVertical: 3 },
  ruleNoteText: { color: colors.green, fontSize: 11, lineHeight: 20 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  recordCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, borderRadius: 15, padding: 20 },
  recordHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  cardTitle: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  recoverCounter: { color: colors.orange, fontSize: 10 },
  recordRow: { flexDirection: 'row', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F0F0E8' },
  recordIndex: { color: colors.muted, fontSize: 11, width: 22, fontVariant: ['tabular-nums'] },
  recordText: { flex: 1, color: colors.ink, fontSize: 12 },
  recordFooter: { marginTop: 14 },
  emptyRecord: { alignItems: 'center', paddingVertical: 22, gap: 9 },
  emptyRecordMark: { color: '#C5CDBA', fontFamily: serif, fontSize: 28 },
  sidebarFooter: { color: '#9AA08F', fontSize: 9, letterSpacing: 1, textAlign: 'center', marginTop: 5 },
  notice: { color: colors.orange, fontSize: 12, lineHeight: 20, marginBottom: 12, paddingHorizontal: 8 },
  modalBackdrop: { flex: 1, backgroundColor: '#132A24A6', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 460, backgroundColor: colors.paper, borderRadius: 22, overflow: 'hidden' },
  modalInner: { padding: 25, gap: 17 },
  modalHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  modalTitle: { color: colors.ink, fontFamily: serif, fontSize: 23, fontWeight: '600', flexShrink: 1 },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  closeText: { color: colors.muted, fontSize: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  fieldLabel: { color: colors.muted, fontSize: 11, marginTop: 6 },
  option: { padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 12, gap: 7 },
  selectedOption: { borderColor: colors.green, backgroundColor: colors.greenLight },
  optionTitle: { color: colors.ink, fontSize: 13, fontWeight: '600', lineHeight: 21 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ruleLead: { color: colors.green, fontFamily: serif, fontSize: 18 },
  ruleItem: { flexDirection: 'row', gap: 13, marginTop: 3 },
  ruleNumber: { color: '#9BAC88', fontSize: 13, paddingTop: 3 },
  resultSymbol: { color: colors.green, fontSize: 64, fontFamily: serif, textAlign: 'center', paddingVertical: 15 },
  resultDetail: { color: colors.ink, fontSize: 15, textAlign: 'center' },
});
