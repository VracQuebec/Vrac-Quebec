import { z } from 'zod';
import { evaluateMaterialCompatibility, type FillRequestProfile } from '@/lib/matching/compatibility';
import { loadMaterialOfferForMatching } from '@/lib/offers/engine';
import type { MaterialOffer } from '@/lib/offers/types';
import type { MaterialKey } from '@/lib/matching/interpreter';
import type { ReceptionConditions } from './conditions';

const time=z.string().datetime({offset:true});
export const receptionPolicySchema=z.object({
 mode:z.enum(['preautorisee','creneaux','par_demande']),
 start:time,end:time,
 windows:z.array(z.object({id:z.guid(),start:time,end:time,capacity:z.number().positive().max(999999),presenceConfirmed:z.boolean()}).strict()).max(60),
 confirmed:z.literal(true),
}).strict().superRefine((p,c)=>{
 if(p.end<=p.start)c.addIssue({code:'custom',message:'Période invalide.'});
 for(const w of p.windows){if(w.end<=w.start||Date.parse(w.start)<Date.parse(p.start)||Date.parse(w.end)>Date.parse(p.end))c.addIssue({code:'custom',message:'Créneau hors période.'});}
 if(p.mode!=='par_demande'&&!p.windows.length)c.addIssue({code:'custom',message:'Horaires explicites requis.'});
 const sorted=[...p.windows].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 if(sorted.some((w,i)=>i>0&&Date.parse(w.start)<Date.parse(sorted[i-1].end)))c.addIssue({code:'custom',message:'Créneaux superposés.'});
});
export type ReceptionPolicy=z.infer<typeof receptionPolicySchema>;
export type CoordinationReason={level:'OK'|'BLOCKER'|'REVIEW';code:string;label:string};
const keyForName=(name:string):MaterialKey=>({Terre:'terre',Sable:'sable',Glaise:'argile',Gravier:'pierre',Roche:'roche',Béton:'beton',Asphalte:'asphalte',Branches:'organique',Souches:'organique',Déchets:'materiel_inconnu'} as Record<string,MaterialKey>)[name]??'materiel_inconnu';
export function evaluateReception(offer:MaterialOffer,c:ReceptionConditions,quantity:number,unit:string,documents:{condition_key:string;stance:string}[]){
 const profile:FillRequestProfile={id:'reception',scope:'explicit',materials:c.materials.map(m=>({materialKey:keyForName(m.name),label:m.name,status:m.stance==='refuse'?'REFUSED':m.stance==='accepte'?'ACCEPTED':'UNKNOWN',source:'user_manual',confidence:'high',confirmedAt:null,confirmedBy:null,maxInches:c.maxRockCm==null?null:c.maxRockCm/2.54})),restrictions:[],conditions:[],environmentStatus:'UNKNOWN',capacity:{kind:c.remaining==null?'unknown':'known',value:c.remaining,unit:c.unit==='inconnu'?null:c.unit},acceptedTruckCodes:[],heavyTruckAccess:'inconnu',originalText:c.explicitConditions??''};
 // Several named organic components must never collapse into a broad acceptance.
 for(const m of profile.materials){if(profile.materials.some(x=>x.materialKey===m.materialKey&&x.status==='REFUSED'))m.status='REFUSED';}
 const material=evaluateMaterialCompatibility(loadMaterialOfferForMatching(offer),profile);
 const reasons:CoordinationReason[]=[...material.reasons];
 const add=(level:CoordinationReason['level'],code:string,label:string)=>reasons.push({level,code,label});
 if(offer.principal_material==='organique'||offer.secondary_materials.includes('organique')||offer.trace_materials.includes('organique')||offer.principal_material==='materiel_inconnu')add('REVIEW','COMPOSITION','Branches, souches ou déchets : nature exacte et admissibilité à valider séparément.');
 if(loadMaterialOfferForMatching(offer).materials.length>1&&c.mixed!=='accepte')add(c.mixed==='refuse'?'BLOCKER':'REVIEW','MIX','Composition mixte '+(c.mixed==='refuse'?'refusée.':'à confirmer.'));
 if(c.environmental==='non_admissible'||c.projectFit==='incompatible'||offer.declared_contaminated)add('BLOCKER','ENVIRONMENT','Admissibilité ou adéquation incompatible.');
 else if(c.environmental!=='documente'||c.projectFit!=='adapte'||offer.environmental_status!=='characterized'||offer.qualification_status!=='qualified')add('REVIEW','DOCUMENTS','Admissibilité documentaire et adéquation à valider par l’équipe.');
 const sourceDocuments=(offer as MaterialOffer&{reception_documents?:{condition_key:string;status:string}[]}).reception_documents??[];
 for(const d of documents){if(d.stance!=='accepted')add(d.stance==='forbidden'?'BLOCKER':'REVIEW','DOCUMENT_'+d.condition_key,'Exigence documentaire : '+d.condition_key+' — '+d.stance);else if(!sourceDocuments.some(x=>x.condition_key===d.condition_key&&x.status==='verified'))add('REVIEW','DOCUMENT_PROOF_'+d.condition_key,'Pièce du chantier non vérifiée pour '+d.condition_key+'.');}
 if(!offer.vehicle_type)add('REVIEW','VEHICLE','Véhicule inconnu.');else{const v=c.vehicles.find(v=>v.name===offer.vehicle_type);if(v?.stance!=='accepte')add(v?.stance==='refuse'?'BLOCKER':'REVIEW','VEHICLE','Véhicule refusé ou à confirmer.');}
 if(!c.access||c.presence==='inconnu')add('REVIEW','ACCESS','Accès ou présence à confirmer.');
 if(unit==='inconnu'||unit!==c.unit||unit!==offer.quantity_unit)add('REVIEW','UNIT','Unités distinctes ou inconnues : aucune conversion automatique.');
 if(offer.quantity_value==null||offer.quantity_approximate)add('REVIEW','QUANTITY','Quantité source inconnue ou approximative.');else if(quantity>offer.quantity_value)add('BLOCKER','OFFER_CAPACITY','Quantité supérieure à l’offre.');
 if(c.remaining==null)add('REVIEW','REMAINING','Besoin restant inconnu.');
 if(c.minimumDelivery!=null&&quantity<c.minimumDelivery)add('BLOCKER','MIN_DELIVERY','Minimum par livraison non atteint.');
 if(c.minimumDay!=null&&quantity<c.minimumDay)add('REVIEW','MIN_DAY','Minimum quotidien non atteint : grouper et faire valider par l’équipe.');
 if(c.progressive==='inconnu')add('REVIEW','PROGRESSIVE','Réception progressive inconnue.');
 if(c.progressive==='non'&&quantity!==c.remaining)add('BLOCKER','PROGRESSIVE','Réception complète exigée.');
 return {result:reasons.some(r=>r.level==='BLOCKER')?'INCOMPATIBLE':reasons.some(r=>r.level==='REVIEW')?'NEEDS_REVIEW':'COMPATIBLE',reasons};
}
export type CoordinationRow={id:string;offerId:string;originId:string;quantity:number;unit:string;vehicle:string|null;components:string[];start:string;end:string;state:string;expiresAt:string;reasons:CoordinationReason[];reference:string;acceptedAt:string|null;counterStart?:string|null;counterEnd?:string|null};
export type ReceptionMeasurement={id:string;tripId:string;reservationId:string;quantity:number;unit:string;receivedAt:string;ticketRef:string;outcome:'accepted'|'refused';corrects:string|null;reason:string|null};
export type CoordinationView={remaining:number|null;total:number|null;reserved:number;delivered?:number;measurements?:ReceptionMeasurement[];communication?:{serviceEmail:boolean;reminderHours:number;startHour:number;endHour:number;weekdays:number[]}|null;unit:string;policy:ReceptionPolicy|null;rows:CoordinationRow[];offers:{id:string;label:string}[];exceptions:{reason:string;at:string;next:string}[]};