import { describe,it,expect } from 'vitest';
import { findSubmission,findQuote } from '../../prepared/fonctions-guard-claim-id/_shared/exact-reference';
function fake(results: any[]) {
  const calls: string[][]=[];
  return { calls, sb: { from:(t:string)=>{
    const chain:any={select:()=>chain,eq:(key:string,value:string)=>{calls.push([t,key,value]);return chain;},maybeSingle:async()=>results.shift(),limit:async()=>results.shift()};return chain;
  } } };
}
describe('exact dossier references',()=>{
  it('submission is selected only by reservation id',async()=>{
    const f=fake([{data:{id:'dossier-A'},error:null}]);
    expect(await findSubmission(f.sb,'claim-A')).toEqual({submission_id:'dossier-A'});
    expect(f.calls).toEqual([['submissions','guard_claim_id','claim-A']]);
  });
  it('lookup error is never treated as absence',async()=>{
    const f=fake([{data:null,error:{code:'42501'}}]);
    await expect(findSubmission(f.sb,'claim')).rejects.toThrow('indisponible');
  });
  it('vrac reference joins quote using the exact request id',async()=>{
    const f=fake([{data:{id:'request-A',request_number:'A'},error:null},{data:[{id:'quote-A',quote_number:'Q',valid_until:'2026-11-01'}],error:null}]);
    const r=await findQuote(f.sb,'claim-A');
    expect(r?.submission_id).toBe('request-A');expect(r?.quote_id).toBe('quote-A');
    expect(f.calls).toEqual([['jsc_requests','guard_claim_id','claim-A'],['jsc_quotes','request_id','request-A']]);
  });
  it('request without quote is preserved as manual, without inventing a quote',async()=>{
    const f=fake([{data:{id:'request-A',request_number:'A'},error:null},{data:[],error:null}]);
    const r=await findQuote(f.sb,'claim');expect(r?.manual).toBe(true);expect(r?.quote_id).toBeNull();
  });
  it('ambiguous quotes or failed quote read block recovery',async()=>{
    for(const result of [{data:[{id:'A'},{id:'B'}],error:null},{data:null,error:{code:'offline'}}]){
      const f=fake([{data:{id:'request-A'},error:null},result]);await expect(findQuote(f.sb,'claim')).rejects.toThrow('incertaine');
    }
  });
});