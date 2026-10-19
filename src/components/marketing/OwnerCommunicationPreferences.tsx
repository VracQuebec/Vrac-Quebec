import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Label} from '@/components/ui/label';
import {exec04Call,isExec04Local} from '@/lib/marketplace/communications';
import type {PortalSession} from '@/lib/remblai/isolated-client';
export default function OwnerCommunicationPreferences({session,verified}:{session:PortalSession|null;verified:boolean}){
 const [rows,setRows]=useState<any[]>([]),[choice,setChoice]=useState(false),[error,setError]=useState('');
 const load=async()=>{if(session)setRows(await exec04Call('preferences',session));};
 useEffect(()=>{if(isExec04Local())void load().catch(e=>setError(e.message));},[session?.requestId]);
 if(!isExec04Local()||!session)return null;
 async function save(state:'granted'|'withdrawn'){if(!session)return;try{await exec04Call('permission',{...session,purpose:'promotion',channel:'email',state,source:'portail_vérifié',proof:state==='granted'?'Choix facultatif explicite : promotions Vrac Québec par courriel.':undefined,operationId:crypto.randomUUID(),confirmed:true});setChoice(false);await load();}catch(e){setError((e as Error).message);}}
 return <section className="space-y-3 border-y border-border py-5"><h2 className="font-semibold">Mes communications</h2><p className="text-sm">Le retrait des promotions ne ferme pas votre demande et reste distinct du suivi opérationnel.</p>{error&&<p role="alert" className="text-destructive">{error}</p>}{rows.map((r,i)=><p className="text-sm" key={i}>{r.purpose} · {r.channel} · {r.state} · {new Date(r.at).toLocaleDateString('fr-CA')}</p>)}<div className="flex gap-3"><Checkbox id="owner-promotion" checked={choice} onCheckedChange={v=>setChoice(v===true)}/><Label htmlFor="owner-promotion">Je souhaite recevoir les promotions Vrac Québec par courriel. Facultatif.</Label></div><div className="flex flex-wrap gap-2"><Button disabled={!choice||!verified} onClick={()=>void save('granted')}>Enregistrer mon choix</Button><Button variant="outline" disabled={!verified} onClick={()=>void save('withdrawn')}>Retirer les promotions</Button></div></section>;
}