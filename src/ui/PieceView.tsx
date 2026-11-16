import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { type Piece, pieceLabel } from '../game/engine';
import { colors, serif } from './theme';

export function PieceView({ piece, size, reversed = false, selected = false }: {
  piece: Piece; size: number; reversed?: boolean; selected?: boolean;
}) {
  return <View pointerEvents="none" style={{ width: size, height: size, transform: [{ rotate: reversed ? '180deg' : '0deg' }] }}>
    <Svg width={size} height={size} viewBox="0 0 48 52" style={StyleSheet.absoluteFill}>
      <Polygon points="24,2 40,11 45,49 3,49 8,11" fill="#B79250" opacity={0.35} transform="translate(0 1)" />
      <Polygon points="24,1 40,10 45,47 3,47 8,10" fill={selected ? '#FFF8DF' : colors.piece} stroke="#CEAD70" strokeWidth={0.8} />
    </Svg>
    <Text allowFontScaling={false} style={[styles.character, { fontSize: size * 0.61, lineHeight: size * 0.98, color: piece.promoted ? colors.red : '#352E23' }]}>{pieceLabel(piece)}</Text>
  </View>;
}
const styles = StyleSheet.create({
  character: { fontFamily: serif, fontWeight: '700', textAlign: 'center', paddingTop: 2 },
});
