import {useEffect,useState} from 'react';
import {punchDb as db} from '@/lib/punch/runtime';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from '@/hooks/use-toast';
import {DRIVER_INVITATIONS_INSTALLED,driverInvitationCall} from '@/lib/auth/driver-invitations';
import {DriverInvitationPanel} from '../../../prepared/reprise-r3-r4/DriverInvitationPanel';
export default function EmployeeAccess({companyId,role}:{companyId:string;role:string}){
 const [members,setMembers]=useState<any[]>([]),[invites,setInvites]=useState<any[]>([]),[email,setEmail]=useState(''),[job,setJob]=useState('operateur'),[busy,setBusy]=useState(false),[link,setLink]=useState('');
 const admin=['support','proprietaire'].includes(role);
 const load=async()=>{const [m,i]=await Promise.all([db.rpc('entcrm_list_members',{_company_id:companyId}),admin?db.from('ent_employee_invites').select('id,email,role,accepted_at,expires_at,revoked_at').eq('company_id',companyId):Promise.resolve({data:[]})]);setMembers(m.data??[]);setInvites(i.data??[])};
 useEffect(()=>{load()},[companyId,admin]);
 async function run(fn:()=>Promise<any>){if(busy)return;setBusy(true);try{const r=await fn();if(r.error)throw Error(r.error.message);await load();}catch(e){toast({title:'Action refusée',description:(e as Error).message,variant:'destructive'})}finally{setBusy(false)}}
 return <details className="border-b border-border pb-3"><summary className="cursor-pointer font-semibold">Accès employés</summary><div className="space-y-3 pt-3">{admin && <div className="flex flex-wrap gap-2"><Input aria-label="Courriel invité" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Courriel personnel"/><select aria-label="Rôle invité" className="h-10 rounded-md border border-border bg-background px-2" value={job} onChange={e=>setJob(e.target.value)}><option value="operateur">Opérateur</option><option value="chauffeur">Chauffeur</option><option value="mecanicien">Mécanicien</option></select><Button disabled={busy||!email.includes('@')} onClick={()=>run(async()=>{const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');const r=await db.rpc('pun_invite_prepare',{_company:companyId,_email:email,_role:job,_key:crypto.randomUUID(),_token:token});if(!r.error)setLink(`${location.origin}/entrepreneur/punch${new URLSearchParams(location.search).get('punch_test')==='local'?'?punch_test=local':''}#invitation=${token}`);return r})}>Préparer une invitation</Button></div>}
 {link&&<div><label className="text-sm">Lien personnel préparé — aucun courriel envoyé<Input aria-label="Lien d’invitation" readOnly value={link}/></label><Button variant="outline" size="sm" onClick={()=>navigator.clipboard.writeText(link)}>Copier le lien</Button></div>}
 {members.map(m=><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2" key={m.user_id}><span className="min-w-0 break-all text-sm">{m.email} · {m.role} · {m.is_active?'Actif':'Accès retiré'}</span>{admin&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>run(()=>db.rpc('entcrm_set_member',{_company_id:companyId,_email:m.email,_role:m.role,_active:!m.is_active}))}>{m.is_active?'Retirer l’accès':'Rétablir l’accès'}</Button>}</div>)}
 {invites.filter(i=>!i.accepted_at&&!i.revoked_at).map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="break-all">{i.email} · Invitation en attente</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>run(()=>db.rpc('pun_invite_revoke',{_id:i.id}))}>Annuler l’invitation</Button></div>)}
 {admin&&DRIVER_INVITATIONS_INSTALLED&&<DriverInvitationPanel key={companyId} company={companyId} call={driverInvitationCall}/>}
 </div></details>;
}
