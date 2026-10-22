import { describe,it,expect } from 'vitest';
import { readMailState,rememberMailState } from '../../prepared/fonctions-guard-claim-id/_shared/mail-status';
describe('prepared mail acceptance state',()=>{
  const reader=(payload:unknown,error:unknown=null)=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{payload},error})})})})});
  it('missing acceptance is unknown, never a false success',async()=>{
    expect(await readMailState(reader({}),'c')).toBe('unknown');
    expect(await readMailState(reader({email_status:'queued'},'offline'),'c')).toBe('unknown');
  });
  it('stored accepted or failed states survive response-loss retry',async()=>{
    expect(await readMailState(reader({email_status:'queued'}),'c')).toBe('queued');
    expect(await readMailState(reader({email_status:'failed'}),'c')).toBe('failed');
  });
  it('acceptance write is scoped to the exact reservation id',async()=>{
    const calls:unknown[]=[];
    await rememberMailState({rpc:async(n:string,p:unknown)=>{calls.push([n,p]);return {error:null};}},'claim-A','queued');
    expect(calls).toEqual([['guard_email_status',{p_claim_id:'claim-A',p_status:'queued'}]]);
  });
});