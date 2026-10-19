import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { REMBLAI_CLOUD_ENABLED } from '@/lib/remblai/activation';
import { cloudPortalCall } from '@/lib/remblai/cloud-client';
import type { RequestRecord } from '@/lib/remblai/service';
import { quantityLabel } from '@/lib/remblai/conditions';
import ReceptionCoordinationPanel from './ReceptionCoordinationPanel';
import ReceptionPhoto from './ReceptionPhoto';
export default function CrmReceptionPanel({ submissionId }: { submissionId: string }) {
 const [row, setRow] = useState<RequestRecord | null>(null); const [error, setError] = useState('');
 useEffect(() => {
  if (!REMBLAI_CLOUD_ENABLED) return; let current = true;
  const read = async () => { try { const result = await cloudPortalCall<RequestRecord>({ kind: 'crm', requestId: submissionId }); if(current){setRow(result);setError('');} } catch { if(current)setError('Conditions indisponibles.'); } };
  void read(); const timer=window.setInterval(()=>void read(),2000);
  return ()=>{current=false;window.clearInterval(timer);};
 },[submissionId]);
 if(!REMBLAI_CLOUD_ENABLED)return null;
 return <section className="space-y-3 border-y border-border py-4"><h3 className="font-display font-semibold">Conditions du propriétaire</h3>{error && <p role="alert">{error}</p>}{row ? <><p>Besoin restant : {quantityLabel(row.conditions.remaining,row.conditions.unit)}</p><p>Disponibilité : {row.availability}</p><div className="grid grid-cols-2 gap-3">{row.conditions.photos.map((photo,i)=><ReceptionPhoto key={i} photo={photo}/>)}</div><Button asChild variant="outline"><a href={`/admin/apercu-suivi-remblai?requestId=${submissionId}`}>Voir les conditions et l’historique</a></Button><ReceptionCoordinationPanel requestId={submissionId} staff /></> : <p role="status">Chargement…</p>}</section>;
}
