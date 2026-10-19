import {useEffect,useState} from 'react';
import {useAuthReady} from './useAuthReady';
import {useUserRoles} from './useUserRole';
import {isolatedSearch,localSearchCall,type SearchSession} from '@/lib/entrepreneur/search-runtime';
import type {User} from '@supabase/supabase-js';
export function useSearchIdentity() {
  const isolated=isolatedSearch();
  const auth=useAuthReady(!isolated);
  const roles=useUserRoles(auth.user,auth.isReady,!isolated);
  const [session,setSession]=useState<SearchSession|null>(null),[ready,setReady]=useState(false);
  useEffect(()=>{if(!isolated)return;let alive=true;localSearchCall<SearchSession>('session').then(s=>{if(alive)setSession(s);}).catch(()=>{}).finally(()=>{if(alive)setReady(true);});return()=>{alive=false;};},[isolated]);
  return isolated?{user:session?({id:session.userId} as User):null,isReady:ready,isEntrepreneur:session?.role==='entrepreneur',isAdmin:false,loading:!ready,session,isolated}:{...auth,...roles,session:null,isolated};
}