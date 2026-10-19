// Invitation fragments must never reach global analytics/notifications providers.
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {punchDb,punchExtended} from '@/lib/punch/runtime';
export default function EmployeeInviteScreen(){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 return <main className="mx-auto max-w-lg space-y-4 p-6"><h1 className="font-display text-2xl font-bold">Accès personnel employé</h1><p className="text-muted-foreground">{punchExtended()?'Connectez-vous avec le courriel personnel de l’invitation pour activer votre accès.':'Les invitations employé attendent la validation en environnement isolé. Aucun accès n’est activé ici.'}</p>{message&&<p role="status">{message}</p>}{punchExtended()&&<Button disabled={busy} onClick={async()=>{setBusy(true);const token=new URLSearchParams(location.hash.slice(1)).get('invitation');const r=await punchDb.rpc('pun_invite_accept',{_token:token});setBusy(false);if(r.error)setMessage(r.error.message);else{history.replaceState(null,'',location.pathname);location.assign('/entrepreneur/punch')}}}>Activer mon accès personnel</Button>}<Button variant="outline" onClick={()=>{history.replaceState(null,'',location.pathname);location.assign('/login')}}>Connexion</Button><Button variant="outline" onClick={()=>{history.replaceState(null,'',location.pathname);location.assign('/')}}>Quitter</Button></main>;
}
