import { useEffect,useState } from 'react';
import HelpWorkspace from './HelpWorkspace';
import {helpLocalCall} from '@/lib/help/progress';
import type {HelpRole} from '@/lib/help/catalog';
import {Button} from '@/components/ui/button';
import PunchBoard from '@/components/punch/PunchBoard';
import {setPunchTestUser} from '@/lib/punch/runtime';
export default function HelpLocalScreen(){
 const [session,setSession]=useState<any>(null),[error,setError]=useState(''),[work,setWork]=useState(false);
 const load=(s:any)=>{setPunchTestUser(s.userId);setSession(s);setWork(false);};
 useEffect(()=>{helpLocalCall('session').then(load).catch(()=>setError('Démonstration isolée non démarrée. Aucun service réel appelé.'));},[]);
 return <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6"><h1 className="font-display text-2xl font-bold">Aide et démonstrations</h1>{error?<p role="alert">{error}</p>:session?<><label className="block text-sm">Identité fictive<select aria-label="Identité fictive d’aide" className="mt-1 h-11 w-full rounded-md border border-input bg-background px-2" value={session.role} onChange={async e=>{try{load(await helpLocalCall('identity',{role:e.target.value}));}catch{setError('Identité TEST indisponible');}}}><option value="proprietaire">Entrepreneur TEST</option><option value="operateur">Employée TEST</option><option value="lecture">Lecture TEST</option><option value="aucun">Accès révoqué TEST</option></select></label>{session.role==='aucun'?<p>Accès retiré pour cette entreprise.</p>:<><Button variant="outline" onClick={()=>setWork(v=>!v)}>{work?'Revenir à l’aide':'Ouvrir mon pointage TEST'}</Button>{work?<PunchBoard key={session.userId} companyId={session.companyId} role={session.role}/>:<HelpWorkspace key={session.userId+session.role} role={session.role as HelpRole} userId={session.userId} companyId={session.companyId}/>}</>}</>:<p>Chargement TEST…</p>}</main>;
}
