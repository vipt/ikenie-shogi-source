import React,{useRef} from 'react';
import type {CpuAnimation} from '../game/cpu-animation';
import {CpuMoveOverlay,type DropOrigin} from './CpuMoveOverlay';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Move, type Position, squareLabel, SIDE_LABEL, pieceLabel } from '../game/engine';
import { PieceView } from './PieceView';
import { colors } from './theme';

export function Board({ position, width, flipped, selected, moves, lastMove, checked, onSquare, disabled, cpuAnimation, onAnimationComplete, getDropOrigin }: {
  position: Position; width: number; flipped: boolean; selected: number | null;
  cpuAnimation?:CpuAnimation;onAnimationComplete:(id:number)=>void;getDropOrigin:DropOrigin;
  moves: Move[]; lastMove?: Move; checked: boolean; onSquare: (square: number) => void; disabled: boolean;
}) {
  const frameRef=useRef<React.ComponentRef<typeof View>>(null);
  const shownMove=cpuAnimation?.move??lastMove;
  const size = (width - 12) / 9;
  const targets = new Set(moves.map(m => m.to));
  const files = flipped ? ['1', '2', '3', '4', '5', '6', '7', '8', '9'] : ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
  const ranks = flipped ? '九八七六五四三二一' : '一二三四五六七八九';
  return <View style={{ width: width + 20 }}>
    <View style={[styles.files, { width, paddingHorizontal: 6 }]}>{files.map(n => <Text key={n} style={[styles.coordinate, { width: size }]}>{n}</Text>)}</View>
    <View style={{ flexDirection: 'row' }}>
      <View ref={frameRef} collapsable={false} style={{width,height:width}}>
      <View style={[styles.frame, { width, height: width }]} testID="shogi-board">
        {Array.from({ length: 9 }, (_, displayRow) => <View key={displayRow} style={styles.boardRow}>
        {Array.from({ length: 9 }, (_, displayCol) => {
          const index = displayRow * 9 + displayCol;
          const square = flipped ? 80 - index : index;
          const piece = position.board[square];
          const target = targets.has(square);
          const ownTarget = target && piece?.side === position.turn;
          const wasLast = shownMove && (shownMove.to === square || ('from' in shownMove && shownMove.from === square));
          const movingFrom=cpuAnimation&&'from' in cpuAnimation.move&&cpuAnimation.move.from===square;
          const recovering=cpuAnimation?.move.to===square&&piece?.side===cpuAnimation.before.position.turn;
          const danger = checked && piece?.kind === 'K' && piece.side === position.turn;
          const star = [20, 24, 56, 60].includes(index);
          return <Pressable
            key={square} testID={`square-${square}`} disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${squareLabel(square)} ${piece ? `${SIDE_LABEL[piece.side]}の${pieceLabel(piece)}` : '空きマス'}${ownTarget ? ' 回収できる' : target ? ' 移動できる' : ''}`}
            accessibilityState={{ selected: selected === square, disabled }}
            onPress={() => onSquare(square)}
            style={[styles.cell,
              wasLast && styles.last, target && styles.target, (ownTarget||recovering) && styles.ownTarget,
              selected === square && styles.selected, danger && styles.danger]}>
            {star && <View style={styles.star} />}
            {piece&&!movingFrom ? <PieceView piece={piece} size={size * 0.88} reversed={(piece.side === 'gote') !== flipped} selected={selected === square} />
              : target ? <View style={styles.dot} /> : null}
            {(ownTarget||recovering) && <View style={styles.recoverBadge}><Text allowFontScaling={false} style={styles.recoverText}>↻</Text></View>}
          </Pressable>;
        })}</View>)}
      </View>
      {cpuAnimation&&<CpuMoveOverlay key={cpuAnimation.id+'-'+width+'-'+flipped} motion={cpuAnimation} width={width} flipped={flipped} frameRef={frameRef} getDropOrigin={getDropOrigin} onComplete={onAnimationComplete}/>}
      </View>
      <View style={{ paddingTop: 6 }}>{Array.from(ranks).map(n => <Text key={n} style={[styles.coordinate, { height: size, lineHeight: size, width: 20 }]}>{n}</Text>)}</View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  files: { flexDirection: 'row', paddingBottom: 8 },
  coordinate: { color: colors.muted, fontSize: 10, textAlign: 'center' },
  frame: { borderWidth: 6, borderColor: '#C99F62', backgroundColor: colors.board, borderRadius: 3, overflow: 'hidden', boxShadow: '0 5px 0 #A77C47, 0 12px 24px #223B3215' },
  boardRow: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: colors.boardLine, alignItems: 'center', justifyContent: 'center' },
  last: { backgroundColor: '#F4DFA9' },
  target: { backgroundColor: '#CBD4A2' },
  ownTarget: { backgroundColor: '#E3AC6E' },
  selected: { backgroundColor: '#8AA57A' },
  danger: { backgroundColor: '#E6997D' },
  dot: { width: 10, height: 10, borderRadius: 8, backgroundColor: '#3D654B70' },
  star: { position: 'absolute', right: -2, bottom: -2, width: 4, height: 4, backgroundColor: '#886334', borderRadius: 2 },
  recoverBadge: { position: 'absolute', right: 0, bottom: 0, borderRadius: 6, backgroundColor: colors.orange, paddingHorizontal: 2 },
  recoverText: { color: '#FFF7E9', fontSize: 10, fontWeight: '800' },
});
