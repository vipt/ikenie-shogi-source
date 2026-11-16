import {UsiEngine} from './usi-engine';
export const KING_BOOK_RULES={kingCapture:'all',selfCapture:'both'} as const;
export const KING_RESEARCH_REMOTE='/data/local/tmp/meguru-king-all';
export async function startKingResearch(multiPV=3,book=false){
 return UsiEngine.start({executable:'C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',args:['-s','emulator-5580','shell',`LD_LIBRARY_PATH=${KING_RESEARCH_REMOTE} ${KING_RESEARCH_REMOTE}/meguru_book_research`],ruleMode:'mobile-king-all',requireKingRecoveryProbe:true,startupTimeoutMs:60000,searchGraceMs:15000,options:{Threads:1,USI_Hash:64,FV_SCALE:20,EvalDir:KING_RESEARCH_REMOTE+'/hao',USI_Ponder:false,USI_OwnBook:book,BookDir:KING_RESEARCH_REMOTE+'/king-book',BookFile:book?'user_book1.db':'no_book',BookMoves:24,BookDepthLimit:0,BookEvalDiff:150,BookEvalBlackLimit:-99999,BookEvalWhiteLimit:-99999,NarrowBook:false,ConsiderBookMoveCount:false,BookIgnoreRate:0,IgnoreBookPly:true,BookOnTheFly:false,EnteringKingRule:'NoEnteringKing',NetworkDelay:0,NetworkDelay2:0,ResignValue:99999,GenerateAllLegalMoves:true,PvInterval:0,OutputFailLHPV:false,MultiPV:multiPV}});
}
