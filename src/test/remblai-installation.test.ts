import {describe,it,expect,vi} from 'vitest';
import {makeEndpoint} from '../../prepared/exec01b/endpoint';
import {cleanFictionalPhotos} from '../../prepared/exec01b/photo-cleanup';
import {trackEvent,trackPageView} from '../lib/analytics/ga4';
import {isPersonalPath} from '../lib/analytics/privacy';
const requestId='12345678-1234-4234-8234-123456789abc';
const linkId='12345678-1234-4234-8234-123456789abd';
describe('EXEC01 installation guards',()=>{
 it('queues code and credentials through one atomic adapter, never separate RPC/send',async()=>{
  const rpc=vi.fn(),send=vi.fn(),dispatchMail=vi.fn(async()=>({ok:true,delivery:'captured-test'}));
  const handler=makeEndpoint({enabled:true,rpc,isAdmin:async()=>true,captureOrSend:send,dispatchMail,portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid'});
  const response=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({kind:'code',requestId,linkId,secret:'a'.repeat(64)})}));
  expect(response.status).toBe(200);expect(rpc).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
  const [input,message]=dispatchMail.mock.calls[0] as unknown as [Record<string,unknown>,Record<string,unknown>];
  expect(input.codeHash).toMatch(/^[a-f0-9]{64}$/);expect(message.text).toMatch(/\d{6}/);expect(message).not.toHaveProperty('to');
  expect(await response.text()).not.toContain(String(message.text));
 });
 it('does not claim delivery after an atomic queue failure',async()=>{
  const handler=makeEndpoint({enabled:true,rpc:vi.fn(),isAdmin:async()=>true,captureOrSend:vi.fn(),dispatchMail:async()=>{throw Error('private');},portalOrigin:'https://test.invalid',corsOrigin:'https://test.invalid'});
  const response=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({kind:'renew',requestId,linkId,secret:'a'.repeat(64)})}));
  expect(response.status).toBe(503);expect(await response.text()).not.toContain('private');
 });
 it('removes only explicitly claimed paths once and records the outcome',async()=>{
  const path=`submissions/${requestId}/${'a'.repeat(64)}.png`;
  const deps={claim:vi.fn(async()=>({claimed:true,claimId:linkId})),remove:vi.fn(async()=>{}),finish:vi.fn(async()=>{})};
  expect(await cleanFictionalPhotos(requestId,[path,path],deps)).toEqual({removed:1});
  expect(deps.remove).toHaveBeenCalledExactlyOnceWith(path);expect(deps.finish).toHaveBeenCalledWith(requestId,path,linkId,true);
 });
 it('retains unclaimed referenced, recent or in-flight objects',async()=>{
  const deps={claim:vi.fn(async()=>({claimed:false})),remove:vi.fn(),finish:vi.fn()};
  expect(await cleanFictionalPhotos(requestId,[`submissions/${requestId}/${'b'.repeat(64)}.png`],deps)).toEqual({removed:0});
  expect(deps.remove).not.toHaveBeenCalled();
 });
 it('does not release a deletion claim after storage removal when history fails',async()=>{
  const path=`submissions/${requestId}/${'c'.repeat(64)}.png`;
  const deps={claim:vi.fn(async()=>({claimed:true,claimId:linkId})),remove:vi.fn(async()=>{}),finish:vi.fn(async()=>{throw Error('History unavailable');})};
  await expect(cleanFictionalPhotos(requestId,[path],deps)).rejects.toThrow('History unavailable');
  expect(deps.finish).toHaveBeenCalledExactlyOnceWith(requestId,path,linkId,true);
 });
 it('rejects files outside the dossier before any storage action',async()=>{
  const deps={claim:vi.fn(),remove:vi.fn(),finish:vi.fn()};
  await expect(cleanFictionalPhotos(requestId,[`submissions/${linkId}/${'b'.repeat(64)}.png`],deps)).rejects.toThrow('hors dossier');expect(deps.claim).not.toHaveBeenCalled();
 });
 it('blocks personal analytics even if a tracker was previously loaded',()=>{
  window.history.replaceState(null,'','/portail/remblai?code=123456#secret=fictif');
  const gtag=vi.fn();window.gtag=gtag;
  trackEvent('private',{code:'123456'});trackPageView(window.location.pathname+window.location.search);
  expect(gtag).not.toHaveBeenCalled();expect(isPersonalPath('/portail/remblai/')).toBe(true);
  window.history.replaceState(null,'','/');delete window.gtag;
 });
});