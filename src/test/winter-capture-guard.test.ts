import {describe,it,expect,vi} from 'vitest';
import {targetedMessageAllowed} from '../../prepared/exec04/queue-guard';
describe('préparation hiver et invitations : aucun transport TEST vers prestataire',()=>{
 for(const recipient of ['chauffeur@test.invalid','hiver@test.test','x@site.example','x@example.com'])it(`destinataire réservé ${recipient} bloqué même sans marqueur`,async()=>{const current=vi.fn().mockResolvedValue(true);expect(await targetedMessageAllowed({to:recipient},current)).toBe(false);expect(current).not.toHaveBeenCalled();});
 it('mode capture reste bloqué même pour une adresse non réservée',async()=>{const current=vi.fn().mockResolvedValue(true);expect(await targetedMessageAllowed({mode:'TEST_CAPTURE_ONLY',to:'capture@domain.fr'},current)).toBe(false);expect(current).not.toHaveBeenCalled();});
 it('un destinataire TEST dans une liste bloque toute remise',async()=>{expect(await targetedMessageAllowed({to:['capture@domain.fr','x@test.invalid']},async()=>true)).toBe(false);});
 it('permission courante retirée bloque une communication ciblée',async()=>{expect(await targetedMessageAllowed({exec04_guard:{messageId:'winter'},to:'capture@domain.fr'},async()=>false)).toBe(false);});
 it('indisponibilité du contrôle ne devient pas une permission',async()=>{await expect(targetedMessageAllowed({exec04_guard:{}},async()=>{throw Error('Lecture refusée');})).rejects.toThrow('Lecture refusée');});
});