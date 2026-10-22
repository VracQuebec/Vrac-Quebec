import { Check, FileCheck2, MapPin, Layers3, Package, Info, Pause, LockKeyhole } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { WAITING_MESSAGE } from '@/lib/remblai/conditions';
import type { RequestRecord } from '@/lib/remblai/service';
import { optionalText, requestStatus, requestQuantity, requestedMaterials, proposalAvailable, confirmedDelivery } from '@/lib/remblai/presentation';
type Row = Omit<RequestRecord, 'history'>;

export default function RequestOverview({ row, crm = false }: { row: Row; crm?: boolean }) {
  const status = requestStatus(row);
  const paused = row.availability === 'suspended';
  const closed = row.availability === 'owner_closed';
  const materials = requestedMaterials(row);
  const steps = ['Demande reçue', ...(proposalAvailable(row) ? ['Proposition disponible'] : []), ...(row.availability === 'available' && row.lastConfirmed ? ['Besoin confirmé'] : []), ...(confirmedDelivery(row) ? ['Livraison confirmée'] : []), ...(paused ? ['Demande en pause'] : []), ...(closed ? ['Demande fermée'] : [])];
  const waiting = paused ? 'Votre demande est en pause. La mettre en pause ne confirme ni ne réserve une livraison. Les renseignements déjà liés à votre dossier restent consultables ci-dessous.' : closed ? 'Votre demande est fermée. Votre dossier est conservé; aucune nouvelle livraison n’est autorisée.' : confirmedDelivery(row) ? 'Une livraison est confirmée. Consultez les renseignements disponibles ci-dessous.' : proposalAvailable(row) ? 'Une proposition vous a été transmise. Elle ne constitue pas une réservation ni une confirmation de livraison.' : WAITING_MESSAGE;
  return <>
    <header className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        {optionalText(row.reference) && <span>{row.reference}</span>}
        <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" aria-hidden />Suivi personnel</span>
      </div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">{crm ? 'Dossier remblai — TEST' : 'Ma demande de remblai'}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {optionalText(row.name) && <p className="min-w-0 text-sm text-muted-foreground">{row.name}</p>}
        <Badge variant="outline" data-testid="availability" className={paused || closed ? 'rounded-md border-border bg-muted px-3 py-1.5 text-foreground' : 'rounded-md border-primary/30 bg-primary/10 px-3 py-1.5 text-foreground'}>
          {paused ? <Pause className="mr-1.5 h-3.5 w-3.5" aria-hidden /> : <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />}{status}
        </Badge>
      </div>
    </header>
    <section aria-labelledby="request-summary" className="rounded-lg border border-border bg-card p-5 sm:p-6">
      <h2 id="request-summary" className="mb-5 flex items-center gap-2 font-display text-lg font-semibold"><FileCheck2 className="h-5 w-5 text-foreground" aria-hidden />Résumé de ma demande</h2>
      <dl className="grid gap-5 sm:grid-cols-2">
        <div className="flex min-w-0 gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden /><div><dt className="text-xs font-medium text-muted-foreground">Secteur du chantier</dt><dd className="mt-1 font-medium">{optionalText(row.city) ?? 'À confirmer'}</dd></div></div>
        <div className="flex min-w-0 gap-3"><Layers3 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden /><div><dt className="text-xs font-medium text-muted-foreground">Matériaux recherchés</dt><dd className="mt-1 font-medium">{materials.length ? materials.join(', ') : 'À confirmer'}</dd></div></div>
        <div className="flex min-w-0 gap-3"><Package className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden /><div><dt className="text-xs font-medium text-muted-foreground">Quantité demandée</dt><dd className="mt-1 font-medium">{requestQuantity(row)}</dd></div></div>
        {optionalText(row.conditions.access) && <div><dt className="text-xs font-medium text-muted-foreground">Accès au chantier</dt><dd className="mt-1 text-sm">{row.conditions.access}</dd></div>}
        {optionalText(row.conditions.instructions) && <div className="sm:col-span-2"><dt className="text-xs font-medium text-muted-foreground">Consignes importantes</dt><dd className="mt-1 whitespace-pre-line text-sm">{row.conditions.instructions}</dd></div>}
      </dl>
    </section>
    <section aria-label="Avancement de ma demande" className="py-6">
      <ol className="flex flex-wrap gap-x-5 gap-y-3">{steps.map((step, i) => <li key={step} className="flex items-center gap-2 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-foreground"><Check className="h-3.5 w-3.5" aria-hidden /></span><span className={i === steps.length - 1 ? 'font-semibold' : 'text-muted-foreground'}>{step}</span></li>)}</ol>
      <div className="mt-4 flex gap-3 border-l-2 border-primary pl-3"><Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><p className="text-sm leading-relaxed text-muted-foreground">{waiting}</p></div>
    </section>
  </>;
}