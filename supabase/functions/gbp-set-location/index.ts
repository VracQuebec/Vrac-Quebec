import { corsHeaders, requireAdmin, getConfigWithToken, gapi, jsonRes, errRes } from "../_shared/gbp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireAdmin(req);
    const { location_name, location_display_name, account_name, account_display_name } = await req.json();
    if (!location_name || !account_name) throw new Error("location_name et account_name requis");
    const { svc, accessToken } = await getConfigWithToken();

    // Fetch full location info
    const readMask = "name,title,storefrontAddress,phoneNumbers,categories,websiteUri,metadata,labels";
    const loc = await gapi(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${location_name}?readMask=${encodeURIComponent(readMask)}`,
      accessToken,
    ) as Record<string, unknown>;

    const addr = (loc.storefrontAddress ?? {}) as { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
    const cats = (loc.categories ?? {}) as { primaryCategory?: { displayName?: string; name?: string }; additionalCategories?: Array<{ displayName?: string }> };
    const meta = (loc.metadata ?? {}) as { mapsUri?: string; placeId?: string; newReviewUri?: string };
    const phones = (loc.phoneNumbers ?? {}) as { primaryPhone?: string };
    const address_lines = addr.addressLines ?? [];

    await svc.from("gbp_config").update({
      account_name, account_display_name: account_display_name ?? null,
      location_name, location_display_name: location_display_name ?? (loc.title as string | null),
      location_address: [...address_lines, addr.locality, addr.administrativeArea, addr.postalCode].filter(Boolean).join(", "),
    }).neq("id", "00000000-0000-0000-0000-000000000000");

    await svc.from("gbp_location").upsert({
      location_name,
      display_name: (loc.title as string) ?? null,
      primary_category: cats.primaryCategory?.displayName ?? null,
      categories: cats.additionalCategories ?? [],
      address_lines,
      locality: addr.locality ?? null,
      region: addr.administrativeArea ?? null,
      postal_code: addr.postalCode ?? null,
      phone: phones.primaryPhone ?? null,
      website_uri: (loc.websiteUri as string) ?? null,
      maps_uri: meta.mapsUri ?? null,
      labels: (loc.labels as unknown[]) ?? [],
      raw: loc,
      fetched_at: new Date().toISOString(),
    }, { onConflict: "location_name" });

    return jsonRes({ ok: true });
  } catch (e) { return errRes(e); }
});