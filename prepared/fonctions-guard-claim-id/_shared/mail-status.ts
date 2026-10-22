// Unknown never becomes success or failure merely because a response was lost.
export type MailState = 'queued' | 'failed' | 'not_sent' | 'unknown';
export async function readMailState(sb: any, claimId: string): Promise<MailState> {
  const { data, error } = await sb.from('public_request_guard').select('payload').eq('id',claimId).maybeSingle();
  if (error) return 'unknown';
  const v=data?.payload?.email_status;
  return ['queued','failed','not_sent'].includes(v) ? v : 'unknown';
}
export async function rememberMailState(sb: any, claimId: string, status: Exclude<MailState,'unknown'>) {
  const { error }=await sb.rpc('guard_email_status',{p_claim_id:claimId,p_status:status});
  if(error) console.warn(JSON.stringify({event:'guard.email_status_unavailable'}));
}