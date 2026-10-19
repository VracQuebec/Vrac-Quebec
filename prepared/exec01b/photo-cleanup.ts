import { scopedPhotoPath } from './photos';
type CleanupDependencies = {
 claim:(requestId:string,path:string)=>Promise<{claimed:boolean;claimId?:string}>;
 remove:(path:string)=>Promise<void>;
 finish:(requestId:string,path:string,claimId:string,removed:boolean)=>Promise<void>;
};
/** Explicit allowlist only: never list a bucket or sweep historical files. */
export async function cleanFictionalPhotos(requestId:string,paths:string[],deps:CleanupDependencies) {
 let removed=0;
 for(const path of new Set(paths)) {
  if(!scopedPhotoPath(requestId,path))throw Error('Photo hors dossier');
  const claim=await deps.claim(requestId,path);
  if(!claim.claimed||!claim.claimId)continue;
  try {await deps.remove(path);}
  catch {await deps.finish(requestId,path,claim.claimId,false);throw Error('Nettoyage à reprendre');}
  // Once storage removed the file, a history failure must retain the deletion
  // claim. Resetting it would allow attachment of an object that no longer exists.
  await deps.finish(requestId,path,claim.claimId,true);removed++;
 }
 return {removed};
}