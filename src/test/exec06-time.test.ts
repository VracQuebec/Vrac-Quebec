import {describe,it,expect} from 'vitest';
import {torontoInstant,torontoMonday,intervalMinutes} from '@/lib/punch/runtime';
describe('dates punch Toronto',()=>{
 it('refuse heure sautée au printemps',()=>expect(()=>torontoInstant('2026-03-08T02:30')).toThrow(/inexistante/));
 it('refuse heure ambiguë automne sans inventer offset',()=>expect(()=>torontoInstant('2026-11-01T01:30')).toThrow(/ambiguë/));
 it('entrée standard a offset Toronto',()=>expect(torontoInstant('2026-10-19T07:00')).toBe('2026-10-19T11:00:00.000Z'));
 it('lundi reste local lorsque UTC est déjà lundi',()=>expect(torontoMonday(new Date('2026-10-19T01:00:00Z'))).toBe('2026-10-12'));
 it('compte seulement une heure chaque côté minuit',()=>{expect(intervalMinutes('2026-10-12T03:00:00Z','2026-10-12T05:00:00Z','2026-10-11','2026-10-11')).toBe(60);expect(intervalMinutes('2026-10-12T03:00:00Z','2026-10-12T05:00:00Z','2026-10-12','2026-10-12')).toBe(60)});
});
