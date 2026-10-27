import { beforeEach, expect, it, vi } from 'vitest';
const { rpc }=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import {driverInvitationCall} from '@/lib/auth/driver-invitations';
beforeEach(()=>rpc.mockReset());
it('preparation uses installed TEST capture, never the ordinary invitation sender',async()=>{
 rpc.mockResolvedValue({data:{id:'invitation',delivery:'queued-test'},error:null});
 await expect(driverInvitationCall('driver_invite_prepare',{_company:'a',_driver:'d',_email:'driver@test.invalid',_key:'key',_token:'fictitious'})).resolves.toBe('invitation');
 expect(rpc).toHaveBeenCalledTimes(1);
 expect(rpc).toHaveBeenCalledWith('driver_invite_capture',expect.objectContaining({_company:'a',_driver:'d',_origin:'https://vracquebec.ca'}));
});
it('renewal uses only the invitation returned by the authorized company catalogue',async()=>{
 rpc.mockResolvedValueOnce({data:{invites:[]},error:null});
 await expect(driverInvitationCall('driver_invite_renew',{_company:'a',_id:'foreign'})).rejects.toThrow('inaccessible');
 expect(rpc).toHaveBeenCalledTimes(1);
 expect(rpc).toHaveBeenCalledWith('driver_invite_options',{_company:'a'});
});
it('capture refusal never returns a successful invitation',async()=>{
 rpc.mockResolvedValue({data:null,error:{message:'Capture TEST seulement'}});
 await expect(driverInvitationCall('driver_invite_prepare',{_company:'a'})).rejects.toThrow('Capture TEST seulement');
});