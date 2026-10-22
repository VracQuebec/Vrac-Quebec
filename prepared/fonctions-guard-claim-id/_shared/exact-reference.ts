// PRÉPARÉ : aucune recherche d'identité ou d'adresse pour retrouver un dossier.
export async function findSubmission(sb: any, claimId: string) {
  const { data, error } = await sb.from('submissions').select('id').eq('guard_claim_id', claimId).maybeSingle();
  if (error) throw new Error('Lecture exacte indisponible');
  return data ? { submission_id: String(data.id) } : null;
}

export async function findQuote(sb: any, claimId: string) {
  const { data: request, error } = await sb.from('jsc_requests').select('id,request_number').eq('guard_claim_id', claimId).maybeSingle();
  if (error) throw new Error('Lecture exacte indisponible');
  if (!request) return null;
  const { data: quotes, error: quoteError } = await sb.from('jsc_quotes').select('id,quote_number,valid_until').eq('request_id', request.id).limit(2);
  if (quoteError || (quotes?.length ?? 0) > 1) throw new Error('Soumission exacte incertaine');
  const quote = quotes?.[0];
  return {
    submission_id: String(request.id), request_id: String(request.id),
    request_number: request.request_number, quote_id: quote?.id ?? null,
    quote_number: quote?.quote_number ?? null, valid_until: quote?.valid_until ?? null,
    manual: !quote,
  };
}