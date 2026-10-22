import { FileText, Truck } from 'lucide-react';
import type { RequestRecord } from '@/lib/remblai/service';
import { clientLabel, optionalText } from '@/lib/remblai/presentation';
export default function RequestActivity({row}: {row: Omit<RequestRecord,'history'>}) {
  const closed = row.availability === 'owner_closed';
  const paused = row.availability === 'suspended';
  return <div className="grid gap-6 border-t border-border py-6 sm:grid-cols-2">{[
    {title:'Propositions', icon:FileText, items:row.proposals, empty:closed ? 'Votre demande est fermée. Aucune proposition à consulter.' : paused ? 'Aucune proposition pour le moment. Votre demande est en pause.' : 'Aucune proposition pour le moment. Nous vous contacterons lorsqu’une option compatible sera disponible.'},
    {title:'Livraisons', icon:Truck, items:row.deliveries, empty:'Aucune livraison confirmée pour le moment.'},
  ].map(group => <section aria-label={group.title} key={group.title}><h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><group.icon className="h-4 w-4 text-muted-foreground" aria-hidden />{group.title}</h2>{group.items.length ? <ul className="divide-y divide-border">{group.items.map(item => <li key={item.id} className="py-3"><p className="text-sm font-medium">{optionalText(item.label) ?? (group.title === 'Propositions' ? 'Proposition liée à ma demande' : 'Livraison liée à ma demande')}</p><p className="mt-1 text-sm text-muted-foreground">{item.status === 'accepte' ? 'Proposition acceptée — livraison non confirmée' : clientLabel(item.status)}</p></li>)}</ul> : <div className="rounded-lg border border-dashed border-border bg-card p-4"><p className="text-sm leading-relaxed text-muted-foreground">{group.empty}</p></div>}</section>)}</div>;
}