import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import PunchBoard from './PunchBoard';
import {punchDb as db,setPunchTestUser} from '@/lib/punch/runtime';
export default function PunchLocalScreen(){
 const [session,setSession]=useState<any>(null),[user,setUser]=useState(''),[company,setCompany]=useState(''),[role,setRole]=useState<string|null>(null),[notice,setNotice]=useState('');
 useEffect(()=>{fetch('http://localhost:55446/session').then(r=>r.json()).then(s=>{setSession(s);setPunchTestUser(s.employee);setUser(s.employee);setCompany(s.company)})},[]);
 useEffect(()=>{if(!user||!company)return;let live=true;setPunchTestUser(user);setRole(null);db.rpc('entcrm_role',{_company_id:company}).then((r:any)=>{if(live)setRole(r.data??'aucun')});return()=>{live=false}},[user,company,notice]);
 if(!session)return <p className="p-6">Chargement TEST…</p>;
 return <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6"><header className="space-y-3 border-b border-border pb-4"><p className="text-sm text-muted-foreground">Employés · TEST local isolé</p><h1 className="font-display text-2xl font-bold">Punch et heures</h1><div className="flex flex-wrap gap-2"><select aria-label="Identité fictive" className="h-10 rounded-md border border-border bg-background px-2" value={user} onChange={e=>{setPunchTestUser(e.target.value);setUser(e.target.value)}}><option value={session.employee}>Léa TEST · employée</option><option value={session.owner}>Employeur TEST</option><option value={session.second}>Marc TEST · employé</option></select><select aria-label="Entreprise active" className="h-10 rounded-md border border-border bg-background px-2" value={company} onChange={e=>setCompany(e.target.value)}><option value={session.company}>{session.name}</option><option value={session.other}>Entreprise distincte — TEST</option></select><Button variant="outline" onClick={()=>setNotice(String(Date.now()))}>Actualiser les droits</Button></div></header>
 {notice&&<p role="status" className="text-sm">{notice.startsWith('Accès')?notice:''}</p>}
 {role==='aucun'?<section className="space-y-3"><p>Accès non activé ou retiré pour cette entreprise.</p>{user===session.employee&&<Button onClick={async()=>{const r=await db.rpc('pun_invite_accept',{_token:session.token});setNotice(r.error?r.error.message:'Accès personnel activé');}}>Activer mon accès personnel TEST</Button>}</section>:role?<PunchBoard key={user+company} companyId={company} role={role}/>:<p>Vérification des droits…</p>}
 </main>;
}
