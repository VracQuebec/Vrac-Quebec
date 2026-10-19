import {validateSector} from '../../src/lib/entrepreneur/search-sector';
import {compareTransportSavings,type SavingsInput} from '../../src/lib/entrepreneur/transport-savings';
export function makeSearchEndpoint(deps:{enabled:boolean;origin:string;authenticate:(r:Request)=>Promise<{userId:string}|null>;preference:(userId:string,companyId:string,sector:unknown|null)=>Promise<unknown>;route:(body:unknown,userId:string)=>Promise<unknown>;address:(input:string,userId:string)=>Promise<unknown>}){
 return async(r:Request)=>{
  const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':deps.origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, Authorization, apikey, x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'};
  if(r.headers.get('origin')&&r.headers.get('origin')!==deps.origin)return new Response('Origin refused',{status:403});
  if(r.method==='OPTIONS')return new Response(null,{headers});
  if(!deps.enabled)return Response.json({error:'Activation disabled'},{status:503,headers});
  const actor=await deps.authenticate(r);if(!actor)return Response.json({error:'Unauthorized'},{status:401,headers});
  try{
   const url=new URL(r.url);let action=url.pathname.split('/').pop();
   // Cloud function invocation uses a JSON action; loopback uses the same handler by path.
   if(action==='entrepreneur-search'&&r.method==='POST'){const p=await r.clone().json();action=p.action;}
   if(action==='preferences'){
    const p=r.method==='POST'?await r.json():{companyId:url.searchParams.get('company')};
    if(typeof p.companyId!=='string')throw Error('Company required');
    const sector=r.method==='POST'?validateSector(p.sector):null;
    return Response.json(await deps.preference(actor.userId,p.companyId,sector),{headers});
   }
   if(action==='savings'&&r.method==='POST'){
    const s=await r.json() as SavingsInput;
    if(!s.baseline||!s.alternative)return Response.json({error:'Invalid scenario'},{status:400,headers});
    const result=compareTransportSavings(s);if(!result)throw Error('Incomplete scenario');
    return Response.json(result,{headers});
   }
   if(action==='route'&&r.method==='POST')return Response.json(await deps.route(await r.json(),actor.userId),{headers});
   if(action==='address'&&r.method==='POST'){const p=await r.json();if(typeof p.address!=='string'||p.address.length<3||p.address.length>500)throw Error('Invalid address');return Response.json(await deps.address(p.address,actor.userId),{headers});}
   return Response.json({error:'Not found'},{status:404,headers});
  }catch(e){const denied=(e as {code?:string}).code==='42501';return Response.json({error:denied?'Unauthorized company':'Invalid or unavailable search input'},{status:denied?403:400,headers});}
 };
}