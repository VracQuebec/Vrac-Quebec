// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { signPhotos, preparePhotos } from '../../prepared/exec01b/photos';
import { photoDisplayUrl } from '../lib/remblai/photo-display';
import { conditionsSchema, unknownConditions } from '../lib/remblai/conditions';
import { makeEndpoint } from '../../prepared/exec01b/endpoint';
import { enqueueOwnerConfirmation } from '../../prepared/exec01b/confirmation-queue';

const id='12345678-1234-4234-8234-123456789abc';
const photo={name:'Entrée.png',preview:`private:submissions/${id}/${'a'.repeat(64)}.png`};
describe('EXEC-01 finalisation ciblée',()=>{
 it('keeps the private reference, signs for 120 seconds and edits without reupload',async()=>{
  const storage={put:vi.fn(),sign:vi.fn(async()=> 'https://test.invalid/private-read')};
  const [read]=await signPhotos(id,[photo],storage);expect(read.preview).toBe(photo.preview);
  expect(storage.sign).toHaveBeenCalledWith(photo.preview.slice(8),120);
  expect(photoDisplayUrl(read)).toBe('https://test.invalid/private-read');
  const parsed=conditionsSchema.parse({...unknownConditions(),photos:[read]});
  expect(parsed.photos[0]).toEqual(photo);
  expect(await preparePhotos(id,parsed.photos,[photo],storage)).toEqual([photo]);expect(storage.put).not.toHaveBeenCalled();
 });
 it('never exposes a raw private path or external unsigned photo on signing failure',async()=>{
  const [read]=await signPhotos(id,[photo],{put:vi.fn(),sign:async()=>{throw Error('private error');}});
  expect(read).toEqual(photo);expect(photoDisplayUrl(read)).toBeNull();
  expect(photoDisplayUrl({preview:'https://example.com/image.png'})).toBeNull();
 });
 it('rejects another dossier before asking storage for a signature',async()=>{
  const storage={put:vi.fn(),sign:vi.fn()};await expect(signPhotos(crypto.randomUUID(),[photo],storage)).rejects.toThrow('hors dossier');expect(storage.sign).not.toHaveBeenCalled();
 });
 it('GET does not call dossier, mail, quota or storage',async()=>{
  const rpc=vi.fn(),captureOrSend=vi.fn(),quota=vi.fn(),isAdmin=vi.fn();
  const handler=makeEndpoint({enabled:true,rpc,captureOrSend,quota,isAdmin,portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid'});
  expect((await handler(new Request('https://test.invalid/portal'))).status).toBe(200);
  for(const fn of [rpc,captureOrSend,quota,isAdmin])expect(fn).not.toHaveBeenCalled();
 });
 const sub={id,request_type:'remblai',parcours_direction:'reception',email:'fiction@capture.internal',name:'Fictif'};
 const deps=()=>({enabled:true,portalOrigin:'https://validation.invalid',rpc:vi.fn(async()=>({ok:true})),envelope:{messageId:crypto.randomUUID(),from:'TEST',senderDomain:'capture.internal',unsubscribeToken:'fictional-only'}});
 it('prepares one canonical queue operation and never returns the bearer',async()=>{
  const d=deps();expect(await enqueueOwnerConfirmation(sub,d)).toEqual({queued:true,replay:false});
  expect(d.rpc).toHaveBeenCalledTimes(1);const p=d.rpc.mock.calls[0][0] as Record<string,any>;
  expect(p.requestId).toBe(id);expect(p.secretHash).toMatch(/^[a-f0-9]{64}$/);expect(p.message.text).toContain('/portail/remblai#requestId=');expect(p.message).not.toHaveProperty('idempotency_key');
 });
 it('disabled path, non-reception and reserved addresses never queue',async()=>{
  const d=deps();expect(await enqueueOwnerConfirmation(sub,{...d,enabled:false})).toBeNull();
  expect(await enqueueOwnerConfirmation({...sub,parcours_direction:'evacuation'},d)).toBeNull();
  await expect(enqueueOwnerConfirmation({...sub,email:'test@test.invalid'},d)).rejects.toThrow('distribuable');expect(d.rpc).not.toHaveBeenCalled();
 });
 it('queue failure is not reported as delivered',async()=>{
  await expect(enqueueOwnerConfirmation(sub,{...deps(),rpc:async()=>({denied:true})})).rejects.toThrow('mise en file');
 });
});