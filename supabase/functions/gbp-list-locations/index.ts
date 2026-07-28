import { corsHeaders, requireAdmin, getConfigWithToken, gapi, jsonRes, errRes } from "../_shared/gbp.ts";

type Account = { name: string; accountName?: string; type?: string };
type Location = { name: string; title?: string; storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string }; categories?: { primaryCategory?: { displayName?: string } }; websiteUri?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireAdmin(req);
    const { accessToken } = await getConfigWithToken();

    const accRes = await gapi("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=50", accessToken) as { accounts?: Account[] };
    const accounts = accRes.accounts ?? [];

    const results: Array<{ account: Account; locations: Location[] }> = [];
    for (const acc of accounts) {
      try {
        const readMask = "name,title,storefrontAddress,categories,websiteUri,metadata";
        const locRes = await gapi(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?pageSize=100&readMask=${encodeURIComponent(readMask)}`,
          accessToken,
        ) as { locations?: Location[] };
        results.push({ account: acc, locations: locRes.locations ?? [] });
      } catch (e) {
        results.push({ account: acc, locations: [], error: (e as Error).message } as unknown as { account: Account; locations: Location[] });
      }
    }
    return jsonRes({ accounts: results });
  } catch (e) { return errRes(e); }
});