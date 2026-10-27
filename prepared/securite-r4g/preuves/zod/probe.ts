const d = Deno.args[0];
const { makeEndpoint } = await import(`file:///tmp/zod/${d}/endpoint.ts`);
const calls:any[]=[];
const ep = makeEndpoint({ rpc: async (i:any)=>{calls.push(i); return {ok:true,status:'active'}}, isAdmin: async()=>false, captureOrSend: async()=>'captured-test', portalOrigin:'https://x.test', corsOrigin:'https://x.test', enabled:true, localHarness:true, quota: async()=>true });
const h = typeof ep==='function'?ep:(ep.handler??ep.fetch);
const u='11111111-1111-4111-8111-111111111111', s='a'.repeat(64);
const cases:[string,any][]= [
 ['read valide',{kind:'read',requestId:u,linkId:u,secret:s}],
 ['uuid invalide',{kind:'read',requestId:'pas-un-uuid',linkId:u,secret:s}],
 ['champ en trop',{kind:'read',requestId:u,linkId:u,secret:s,x:1}],
 ['code 5 chiffres',{kind:'verify',requestId:u,linkId:u,secret:s,code:'12345'}],
 ['uuid nil-like guid',{kind:'read',requestId:'00000000-0000-0000-0000-000000000000',linkId:u,secret:s}],
];
for (const [n,b] of cases){ const r=await h(new Request('https://x.test/',{method:'POST',headers:{'content-type':'application/json',origin:'https://x.test'},body:JSON.stringify(b)})); console.log(d,n,r.status); }
