import {requireOptionalNativeModule} from 'expo-modules-core';
/** mask uses bits 0/1 for recovery sides, bit 2 for king recovery. */
type EngineModule = {
  analyze(position:string,model:string,mask:number,book:boolean,ms:number,gameId:string,requestId:number,limits:{moveLimit:number;maxDepth:number}):Promise<string>;
  progress(requestId:number):string;
  cancel(requestId:number):void;
  inspect(position:string,model:string,mask:number):Promise<string>;
};
export default requireOptionalNativeModule<EngineModule>('MeguruEngine');
