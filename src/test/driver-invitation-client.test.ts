import {describe,it,expect,vi} from 'vitest';
import {activateDriverInvitation,prepareDriverInvitation} from '../../prepared/reprise-r3-r4/invitation-client';
describe('adaptateur chauffeur préparé, aucune activation implicite',()=>{
 it('service non installé refuse avant toute activation',async()=>{await expect(activateDriverInvitation('a'.repeat(64))).rejects.toThrow('non installées');});
 it('résultat incomplet ne devient jamais un accès confirmé',async()=>{await expect(activateDriverInvitation('a'.repeat(64),async()=>({company_id:'a'}) as never)).rejects.toThrow('non confirmée');});
 it('activation exige les trois identités retournées sans donner des droits admin',async()=>{const result={company_id:'a',driver_id:'d',user_id:'u'};expect(await activateDriverInvitation('a'.repeat(64),async()=>result as never)).toEqual(result);});
 it('profil et entreprise sont explicitement transmis et restent distincts',async()=>{const call=vi.fn().mockResolvedValue('invite');expect(await prepareDriverInvitation('a','d','test@test.invalid','key','a'.repeat(64),call)).toBe('invite');expect(call).toHaveBeenCalledWith('driver_invite_prepare',{_company:'a',_driver:'d',_email:'test@test.invalid',_key:'key',_token:'a'.repeat(64)});});
});