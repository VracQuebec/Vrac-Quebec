import { z } from 'npm:zod@3.25.76';
type PhotoCategoryKey = "materiau" | "acces" | "chantier" | "autre";

// The public wizard and owner editor use the same draft and validation.
export interface ParcoursDraft {
  address: string; postalCode: string; lat: number | null; lng: number | null;
  quantityValue: string; quantityUnit: string; quantityUnknown: boolean;
  projectUsage: string; materials: string[]; otherMaterial: string;
  materialDescription: string; refusedMaterials: string[];
  soilCharacterized: string; soilCharacterizedDetails: string;
  truckType: string; desiredDate: string; timeframe: string;
  accessHeavyTruck: string; accessDetails: string[];
  photos: { url: string; category: PhotoCategoryKey; signedUrl?: string }[];
  name: string; phone: string; email: string; notes: string;
  unavailableFields?: string[];
}
export const emptyParcoursDraft: ParcoursDraft = {
  address: '', postalCode: '', lat: null, lng: null, quantityValue: '', quantityUnit: 'voyages', quantityUnknown: false,
  projectUsage: '', materials: [], otherMaterial: '', materialDescription: '', refusedMaterials: [],
  soilCharacterized: '', soilCharacterizedDetails: '', truckType: '', desiredDate: '', timeframe: '',
  accessHeavyTruck: '', accessDetails: [], photos: [], name: '', phone: '', email: '', notes: '',
};
export const PUBLIC_RECEPTION_STEPS = ['address', 'quantity', 'project', 'material', 'access', 'photos', 'contact'] as const;
export function publicStepError(step: string, data: ParcoursDraft): string | null {
  if (step === 'address' && data.address.trim().length < 5) return "Inscrivez l'adresse du chantier (au moins 5 caractères) pour continuer.";
  if (step === 'quantity' && !data.quantityUnknown && !/^\d*(?:[.,]\d+)?$/.test(data.quantityValue)) return 'Indiquez une quantité valide ou choisissez « Je ne sais pas ».';
  if (step === 'material' && data.materials.length === 0) return 'Choisissez au moins un matériau pour continuer.';
  if (step === 'contact') {
    const miss: string[] = [];
    if (data.name.trim().length <= 1) miss.push('votre nom');
    if (data.phone.replace(/\D/g, '').length < 10) miss.push('un téléphone à 10 chiffres');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim())) miss.push('un courriel valide (ex. nom@domaine.ca)');
    if (miss.length) return `Pour envoyer, indiquez ${miss.join(', ')}.`;
  }
  return null;
}
// No identifiers, administrative state, coordinates or identity owner in this payload.
export const publicEditSchema = z.object({
  address: z.string().trim().min(5).max(500), postalCode: z.string().max(12),
  quantityValue: z.string().max(40).regex(/^\d*(?:[.,]\d+)?$/), quantityUnit: z.enum(['voyages', 'tonnes', 'verges3', 'm3', 'inconnu']), quantityUnknown: z.boolean(),
  projectUsage: z.string().max(160), materials: z.array(z.string().min(1).max(120)).min(1).max(15), otherMaterial: z.string().max(300),
  accessHeavyTruck: z.string().max(120), accessDetails: z.array(z.string().max(120)).max(20),
  photos: z.array(z.object({url: z.string().max(7000000), category: z.enum(['materiau','acces','chantier','autre'])}).strict()).max(20),
  name: z.string().trim().min(2).max(160), phone: z.string().max(40).refine(v => v.replace(/\D/g, '').length >= 10),
  email: z.string().email().max(254), notes: z.string().max(4000),
}).strict();
export type PublicEdit = Pick<ParcoursDraft, 'address'|'postalCode'|'quantityValue'|'quantityUnit'|'quantityUnknown'|'projectUsage'|'materials'|'otherMaterial'|'accessHeavyTruck'|'accessDetails'|'name'|'phone'|'email'|'notes'> & {photos:{url:string;category:PhotoCategoryKey}[]};
export function publicEditPayload(d: ParcoursDraft): PublicEdit {
  const validated = publicEditSchema.parse({address:d.address, postalCode:d.postalCode, quantityValue:d.quantityValue,
    quantityUnit:d.quantityUnit, quantityUnknown:d.quantityUnknown, projectUsage:d.projectUsage,
    materials:d.materials, otherMaterial:d.otherMaterial, accessHeavyTruck:d.accessHeavyTruck,
    accessDetails:d.accessDetails, photos:d.photos.map(p=>({url:p.url,category:p.category})),
    name:d.name, phone:d.phone, email:d.email, notes:d.notes});
  return {...validated, photos:validated.photos.map(p=>{if(typeof p.url !== 'string' || !p.category) throw Error('Photo invalide'); return {url:p.url,category:p.category};})} as PublicEdit;
}