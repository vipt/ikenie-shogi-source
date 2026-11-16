import AsyncStorage from '@react-native-async-storage/async-storage';
import {createGameRepository} from './archive-store';
export { serialize, deserialize, DEFAULT_SETTINGS, type Settings } from './persistence';
const repository=createGameRepository(AsyncStorage);
export const {loadGame,saveGame,archiveGame,importGame,archiveKeys,archiveSummaries,readArchive,deleteArchive}=repository;
