import {useState,useRef} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {supabase} from '@/integrations/supabase/client';
type Auth=Pick<typeof supabase.auth,'signInWithPassword'|'signUp'>;
// Authenticate on the isolated invitation document. Bearer fragment never leaves for /login.
export default function InvitationLogin({onConnected,auth=supabase.auth}:{onConnected:()=>void;auth?:Auth}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[create,setCreate]=useState(false);const lock=useRef(false);
 return <form className="space-y-3" onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  if(create){const r=await auth.signUp({email,password});if(r.error)throw r.error;setError('Compte créé : confirmez votre courriel, puis revenez à cette invitation pour vous connecter.');setCreate(false);}
  else{const r=await auth.signInWithPassword({email,password});if(r.error)throw r.error;if(!r.data.user||!r.data.session)throw Error('Connexion non confirmée.');onConnected();}
 }catch(e){setError(e instanceof Error?e.message:'Connexion refusée.');}finally{setBusy(false);lock.current=false;}}}>
 <label className="block text-sm">Courriel personnel<Input aria-label="Courriel personnel" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label className="block text-sm">Mot de passe<Input aria-label="Mot de passe personnel" type="password" autoComplete={create?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={busy}>{create?'Créer mon compte personnel':'Se connecter'}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setCreate(v=>!v)}>{create?'J’ai déjà un compte':'Créer un accès personnel'}</Button>
 </form>;
}