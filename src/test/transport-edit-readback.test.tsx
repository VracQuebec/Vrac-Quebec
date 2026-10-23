import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
const state=vi.hoisted(()=>({row:{id:'transport-fictif',current_version:1,lifecycle_status:'a_valider',client_notes:'Avant'} as Record<string,unknown>,persist:true,calls:0,toast:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
 const q={select:()=>q,eq:()=>q,order:async()=>({data:[],error:null}),maybeSingle:async()=>({data:table==='transport_requests'?{...state.row}:null,error:null})};return q;
},rpc:async()=>{state.calls++;if(state.persist)state.row={...state.row,client_notes:'Après',current_version:2};return {data:{version:2},error:null};}}}));
vi.mock('@/hooks/use-toast',()=>({toast:state.toast}));
import TransportLifecyclePanel from '@/components/entrepreneur-app/TransportLifecyclePanel';
beforeEach(()=>{state.row={id:'transport-fictif',current_version:1,lifecycle_status:'a_valider',client_notes:'Avant'};state.persist=true;state.calls=0;state.toast.mockClear();});
afterEach(cleanup);
async function submit(){fireEvent.click(await screen.findByRole('button',{name:'Modifier ma demande'}));fireEvent.change(screen.getByLabelText('Notes'),{target:{value:'Après'}});fireEvent.click(screen.getByRole('button',{name:'Continuer'}));fireEvent.click(screen.getByRole('button',{name:'Enregistrer'}));}
describe('transport — succès seulement après relecture',()=>{
 it('annonce une édition uniquement si les valeurs et la version se relisent',async()=>{const changed=vi.fn();render(<TransportLifecyclePanel id="transport-fictif" onChanged={changed}/>);await submit();await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));expect(state.calls).toBe(1);expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Modification enregistrée'}));});
 it('refuse un résultat RPC non persisté sans succès ni rafraîchissement',async()=>{state.persist=false;const changed=vi.fn();render(<TransportLifecyclePanel id="transport-fictif" onChanged={changed}/>);await submit();await waitFor(()=>expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({variant:'destructive'})));expect(changed).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Enregistrer'})).toBeInTheDocument();});
});