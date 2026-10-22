import {unknownConditions,type ReceptionConditions} from './conditions.ts';
export type LegacyReception = {quantity_value:number|null;quantity_unit:string|null;opening_hours:string|null;capacity_value?:number|null;capacity_unit?:string|null;capacity_kind?:string|null;access_notes?:string|null};
export function legacyReception(input: LegacyReception): ReceptionConditions {
 const result = unknownConditions(); const unit = input.capacity_unit ?? input.quantity_unit;
 if (unit === 'tonnes' || unit === 'm3' || unit === 'verges3' || unit === 'voyages') {
  result.unit = unit;
  result.total = input.capacity_kind === 'known' ? input.capacity_value ?? null : input.quantity_unit === unit ? input.quantity_value : null;
 }
 result.hours = input.opening_hours; result.access = input.access_notes ?? null;
 return result;
}
