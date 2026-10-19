import {describe,it,expect,beforeEach} from 'vitest';
import {allowedArticles,searchArticles} from '@/lib/help/catalog';
import {recordAction,readProgress,pauseProgress,isHelpLocal} from '@/lib/help/progress';
describe('EXEC07 accès et démarrage',()=>{
 beforeEach(()=>localStorage.clear());
 it('employé limité sans CRM, finances ni flotte',()=>{const ids=allowedArticles('operateur').map(a=>a.id);expect(ids).toEqual(['punch','agenda']);});
 it('révocation ne donne aucun parcours',()=>{expect(allowedArticles('aucun')).toEqual([]);});
 it('recherche respecte droits et accents',()=>{expect(searchArticles('proprietaire','reglement').map(a=>a.id)).toContain('reglement');expect(searchArticles('operateur','facture')).toEqual([]);});
 it('passer puis reprendre ne complète aucune action',()=>{pauseProgress('u','c',true);expect(readProgress('u','c')).toEqual({paused:true,completed:{}});pauseProgress('u','c',false);expect(readProgress('u','c').completed).toEqual({});});
 it('action confirmée reste séparée par compte et entreprise',()=>{recordAction('u','c','punch');expect(readProgress('u','c').completed.punch).toBeTruthy();expect(readProgress('other','c').completed.punch).toBeUndefined();expect(readProgress('u','other').completed.punch).toBeUndefined();});
 it('identité absente ne produit pas un avancement',()=>{recordAction(null,'c','client');expect(readProgress('u','c').completed).toEqual({});});
 it('démonstration nécessite localhost et sélection explicite',()=>{window.history.replaceState({},'', '/entrepreneur/aide');expect(isHelpLocal()).toBe(false);});
});
