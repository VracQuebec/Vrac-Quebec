import { CalendarDays, ClipboardList, Layers3, Truck, SlidersHorizontal, Image } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import ReceptionPhoto from './ReceptionPhoto';
import type { RequestRecord } from '@/lib/remblai/service';
import { quantityLabel } from '@/lib/remblai/conditions';
import { optionalText, clientLabel } from '@/lib/remblai/presentation';
type Pair = [string, string | null];
function Values({ items }: { items: Pair[] }) {
  return <dl className="grid gap-4 sm:grid-cols-2">{items.filter(([,value]) => value !== null).map(([label,value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-line leading-relaxed">{value}</dd></div>)}</dl>;
}
export default function RequestDetails({ row }: { row: Omit<RequestRecord, 'history'> }) {
  const c = row.conditions;
  const amount = (value: number | null) => value !== null && c.unit !== 'inconnu' ? quantityLabel(value, c.unit) : null;
  const preferences = (items: typeof c.materials) => items.filter(m => m.stance !== 'a_confirmer').map(m => [m.name, clientLabel(m.stance)] as Pair);
  const groups = [
    { key: 'conditions', title: 'Conditions de réception détaillées', icon: ClipboardList, items: [
      ['Quantité totale', amount(c.total)], ['Besoin restant', amount(c.remaining)], ['Minimum par livraison', amount(c.minimumDelivery)], ['Minimum par journée', amount(c.minimumDay)],
      ['Réception progressive', c.progressive === 'inconnu' ? null : clientLabel(c.progressive)], ['Taille maximale de roche', c.maxRockCm === null ? null : `${c.maxRockCm} cm`],
      ['Accès', optionalText(c.access)], ['Présence nécessaire', c.presence === 'inconnu' ? null : clientLabel(c.presence)],
    ] as Pair[] },
    { key: 'materials', title: 'Préférences de matériaux', icon: Layers3, items: [...preferences(c.materials), ['Composition mixte', c.mixed === 'a_confirmer' ? null : clientLabel(c.mixed)], ['Précisions sur la composition', optionalText(c.mixedDetails)]] as Pair[] },
    { key: 'vehicles', title: 'Types de véhicules souhaités', icon: Truck, items: preferences(c.vehicles) },
    { key: 'period', title: 'Période et créneaux', icon: CalendarDays, items: [
      ['Mode de réception souhaité', c.mode === 'a_confirmer' ? null : clientLabel(c.mode)], ['Début souhaité', optionalText(c.periodStart)], ['Fin souhaitée', optionalText(c.periodEnd)], ['Créneaux souhaités', optionalText(c.slots)], ['Horaires', optionalText(c.hours)],
    ] as Pair[] },
    { key: 'specific', title: 'Conditions particulières', icon: SlidersHorizontal, items: [
      ['Consignes', optionalText(c.instructions)], ['Conditions de réception', optionalText(c.explicitConditions)], ['Documents environnementaux', c.environmental === 'a_valider' ? null : clientLabel(c.environmental)], ['Adéquation au projet', c.projectFit === 'a_valider' ? null : clientLabel(c.projectFit)],
    ] as Pair[] },
  ];
  return <section aria-labelledby="request-details" className="border-t border-border py-6">
    <h2 id="request-details" className="font-display text-lg font-semibold">Les détails de ma demande</h2>
    <Accordion type="multiple" className="mt-2">{groups.map(group => <AccordionItem value={group.key} key={group.key}><AccordionTrigger className="min-h-12 gap-3 text-left text-sm hover:no-underline"><span className="flex items-center gap-3"><group.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />{group.title}</span></AccordionTrigger><AccordionContent className="pl-7">{group.items.some(([,value]) => value !== null) ? <Values items={group.items} /> : <p className="text-muted-foreground">{group.key === 'materials' || group.key === 'vehicles' ? 'Aucune préférence précisée.' : 'Aucune précision supplémentaire.'}</p>}{['materials','vehicles','period'].includes(group.key) && <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Ces préférences ne réservent ni n’autorisent une livraison. Chaque proposition reste soumise aux vérifications nécessaires.</p>}</AccordionContent></AccordionItem>)}
      {c.photos.length > 0 && <AccordionItem value="photos"><AccordionTrigger className="min-h-12 text-sm hover:no-underline"><span className="flex items-center gap-3"><Image className="h-4 w-4 text-muted-foreground" aria-hidden />Photos de ma demande ({c.photos.length})</span></AccordionTrigger><AccordionContent><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{c.photos.map((photo,i) => <ReceptionPhoto key={i} photo={photo} />)}</div></AccordionContent></AccordionItem>}
    </Accordion>
  </section>;
}