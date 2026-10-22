import { preparePhotos, signPhotos, scopedPhotoPath, type PhotoStorage } from '../exec01b/photos';
type Photo = {url:string; category:string; signedUrl?:string};
// Existing public intake URLs are accepted ONLY if already attached to this exact dossier.
export async function prepareOriginalPhotos(id:string, photos:Photo[], previous:Photo[], storage?:PhotoStorage):Promise<Photo[]> {
  const out:Photo[]=[];
  for (const photo of photos) {
    if (previous.some(p=>p.url===photo.url)) {
      if (photo.url.startsWith('private:') && !scopedPhotoPath(id,photo.url.slice(8))) throw Error('Photo hors dossier');
      out.push({...photo}); continue;
    }
    const converted=await preparePhotos(id,[{name:photo.category,preview:photo.url}],[],storage);
    const first=converted[0]; if(!first) throw Error('Photo refusée');
    out.push({url:first.preview,category:photo.category});
  }
  return out;
}
export async function signOriginalPhotos(id:string,photos:Photo[],storage:PhotoStorage) {
  return Promise.all(photos.map(async p=>{
    if(!p.url.startsWith('private:')) return p;
    const signed=await signPhotos(id,[{name:p.category,preview:p.url}],storage);
    return {...p,signedUrl:signed[0]?.signedUrl};
  }));
}