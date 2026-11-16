import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { projectRoot,startInstalledEngine } from './installed-usi';
export async function startTrainedRecoveryEngine(useBook=true) {
  const root=resolve(projectRoot,'artifacts/engines/recovery-v1');
  const model=JSON.parse(await readFile(resolve(root,'training-manifest.json'),'utf8'));
  if(!model.architecture.startsWith('HalfKP256;'))throw new Error('Unexpected trained architecture');
  const settings:{evalFile:string;evalSha256:string;bookDir?:string}={evalFile:model.evalFile,evalSha256:model.sha256};
  if(useBook){
    const book=JSON.parse(await readFile(resolve(root,'book-manifest.json'),'utf8'));
    if(book.modelSha256!==model.sha256 || book.rules.kingCapture!=='enemy'||book.rules.selfCapture!=='both')throw new Error('Book/model/rule mismatch');
    const bytes=await readFile(resolve(root,'book/user_book1.db'));
    if(createHash('sha256').update(bytes).digest('hex')!==book.sha256)throw new Error('Book checksum mismatch');
    settings.bookDir=resolve(root,'book');
  }
  return startInstalledEngine('recovery',settings);
}

