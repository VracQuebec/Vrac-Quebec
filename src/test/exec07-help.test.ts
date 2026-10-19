import {describe,it,expect,beforeEach} from 'vitest';
import {allowedArticles,searchArticles,articleForPath} from '@/lib/help/catalog';
import {recordAction,readProgress,pauseProgress,isHelpLocal,searchCompleted} from '@/lib/help/progress';
describe('EXEC07 accès et démarrage',()=>{
 beforeEach(()=>localStorage.clear());
 it('employé limité sans CRM, finances ni flotte',()=>{const ids=allowedArticles('operateur').map(a=>a.id);expect(ids).toEqual(['punch','agenda']);});
 it('révocation ne donne aucun parcours',()=>{expect(allowedArticles('aucun')).toEqual([]);});
 it('la tâche d’aide suit la soumission ou le client sans confondre les onglets',()=>{expect(articleForPath('/entrepreneur/crm?tab=quotes&quote=test')).toBe('soumission');expect(articleForPath('/entrepreneur/crm?tab=clients')).toBe('clients');expect(articleForPath('/portail/remblai?server=local')).toBe('reception');expect(articleForPath('/entrepreneur/punch?punch_test=local')).toBe('punch');});
 it('recherche respecte droits et accents',()=>{expect(searchArticles('proprietaire','reglement').map(a=>a.id)).toContain('reglement');expect(searchArticles('operateur','facture')).toEqual([]);});
 it('passer puis reprendre ne complète aucune action',()=>{pauseProgress('u','c',true);expect(readProgress('u','c')).toEqual({paused:true,completed:{}});pauseProgress('u','c',false);expect(readProgress('u','c').completed).toEqual({});});
 it('action confirmée reste séparée par compte et entreprise',()=>{recordAction('u','c','punch');expect(readProgress('u','c').completed.punch).toBeTruthy();expect(readProgress('other','c').completed.punch).toBeUndefined();expect(readProgress('u','other').completed.punch).toBeUndefined();});
 it('identité absente ne produit pas un avancement',()=>{recordAction(null,'c','client');expect(readProgress('u','c').completed).toEqual({});});
 it('démonstration nécessite localhost et sélection explicite',()=>{window.history.replaceState({},'', '/entrepreneur/aide');expect(isHelpLocal()).toBe(false);});
 it('première recherche exige résultat confirmé, pas une saisie ou erreur',()=>{expect(searchCompleted(false,true,'gravier',1)).toBe(true);expect(searchCompleted(true,true,'gravier',1)).toBe(false);expect(searchCompleted(false,false,'gravier',1)).toBe(false);expect(searchCompleted(false,true,'gravier',0)).toBe(false);expect(searchCompleted(false,true,' ',1)).toBe(false);});
});
