import { Platform } from 'react-native';

export const colors = {
  background: '#F6F4ED', paper: '#FFFEFA', ink: '#223B32', muted: '#7C8276',
  green: '#2F5D48', greenLight: '#E6EDDF', line: '#DFE2D7',
  board: '#E9C889', boardLine: '#B58E53', piece: '#FFF0C9',
  orange: '#B56336', orangeLight: '#F7E8D6', red: '#B54838',
};
export const serif = Platform.select({ ios: 'Hiragino Mincho ProN', android: 'serif', default: '"Yu Mincho", "Noto Serif JP", serif' });
