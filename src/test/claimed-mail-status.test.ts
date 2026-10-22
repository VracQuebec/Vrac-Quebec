import { describe,it,expect } from 'vitest';
import { readMailState,rememberMailState } from '../../prepared/fonctions-guard-claim-id/_shared/mail-status';
import { deliveryResult,mailResponse } from '../../prepared/fonctions-guard-claim-id/_shared/delivery-result';
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
  it('lost or unreadable responses never prove acceptance or rejection',()=>{
    for(const body of [null,{},'invalid'])expect(deliveryResult(true,body)).toBe('unknown');
    expect(deliveryResult(false,{success:true})).toBe('unknown');
    expect(mailResponse('unknown')).toEqual({email_status:'unknown',email_sent:null});
  });
  it('explicit acceptance, rejection and voluntary suppression remain distinct',()=>{
    expect(deliveryResult(true,{success:true})).toBe('queued');
    expect(deliveryResult(false,{success:false})).toBe('failed');
    expect(deliveryResult(true,{reason:'no_client_email'})).toBe('not_sent');
    expect(mailResponse('not_sent')).toEqual({email_status:'not_sent',email_sent:false});
  });
  it('uncertainty performs no status mutation',async()=>{
    let calls=0;await rememberMailState({rpc:async()=>{calls++;return{error:null};}},'claim-A','unknown');expect(calls).toBe(0);
  });
});