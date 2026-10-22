// Same policy for local object adapter and private Cloud Storage.
export interface PhotoStorage {
 put(path:string,bytes:Uint8Array,mime:string):Promise<void>;
 sign(path:string,seconds:number):Promise<string>;
}
type Photo={name:string;preview:string};
const marker='private:';
export function scopedPhotoPath(id:string,path:string) {
 return path.startsWith(`submissions/${id}/`) && /^submissions\/[a-f0-9-]{36}\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(path);
}
export async function preparePhotos(id:string,photos:Photo[],previous:Photo[],storage?:PhotoStorage):Promise<Photo[]> {
 const result:Photo[]=[];
 for(const photo of photos){
  let path=photo.preview.startsWith(marker)?photo.preview.slice(marker.length):'';
  if(!path && /^https?:/.test(photo.preview)) {
   const pathname=new URL(photo.preview).pathname;
   const offset=pathname.indexOf('/submissions/');
   if(offset>=0)path=decodeURIComponent(pathname.slice(offset+1));
  }
  if(path){
   if(!scopedPhotoPath(id,path)||!previous.some(p=>p.preview===marker+path))throw Error('Photo hors dossier');
   result.push({name:photo.name,preview:marker+path});continue;
  }
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(photo.preview);
  if(!match || !storage)throw Error('Stockage photo indisponible');
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
  if(bytes.length>4000000||bytes.length<12)throw Error('Taille photo invalide');
  const mime=match[1];
  const valid=mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!valid)throw Error('Contenu photo invalide');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  path=`submissions/${id}/${hash}.${mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp'}`;
  await storage.put(path,bytes,mime);result.push({name:photo.name,preview:marker+path});
 }
 return result;
}
export async function signPhotos(id:string,photos:Photo[],storage:PhotoStorage):Promise<(Photo & {signedUrl?:string})[]> {
 return Promise.all(photos.map(async p=>{
  const path=p.preview.slice(marker.length);
  if(!p.preview.startsWith(marker)||!scopedPhotoPath(id,path))throw Error('Photo hors dossier');
  // The expiring URL is never persisted or used in an operation fingerprint.
  try { return {name:p.name,preview:p.preview,signedUrl:await storage.sign(path,120)}; }
  catch { return {name:p.name,preview:p.preview}; }
 }));
}