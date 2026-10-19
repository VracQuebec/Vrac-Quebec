type Row=Record<string,any>;type Database={public:{Tables:{submissions:{Row:Row};submission_fill_profile:{Row:Row}}}};
import { unknownConditions, type ReceptionConditions } from './conditions.ts';
type Submission = Database['public']['Tables']['submissions']['Row'];
type Profile = Database['public']['Tables']['submission_fill_profile']['Row'];
export type LegacyReception = Pick<Submission, 'quantity_value' | 'quantity_unit' | 'opening_hours'> & Partial<Pick<Profile, 'capacity_value' | 'capacity_unit' | 'capacity_kind' | 'access_notes'>>;
export function legacyReception(input: LegacyReception): ReceptionConditions {
 const result = unknownConditions(); const unit = input.capacity_unit ?? input.quantity_unit;
 if (unit === 'tonnes' || unit === 'm3' || unit === 'verges3' || unit === 'voyages') {
  result.unit = unit;
  result.total = input.capacity_kind === 'known' ? input.capacity_value ?? null : input.quantity_unit === unit ? input.quantity_value : null;
 }
 result.hours = input.opening_hours; result.access = input.access_notes ?? null;
 return result;
}
