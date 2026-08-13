import { describe, it, expect, vi } from "vitest";
import {
  fetchLinkedTransportRequest,
  mapLinkedTransport,
} from "@/lib/parcours/validation";

const SUB = "11111111-1111-1111-1111-111111111111";
const TR = "33333333-3333-3333-3333-333333333333";

const row = {
  id: TR,
  request_number: "TR-2026-0007",
  status: "nouvelle",
  created_at: "2026-08-13T12:00:00Z",
  origin_submission_id: SUB,
  origin_stage: "transport_request",
  dump_name: "Dompe #42",
  site_address: "100 rue Test, Québec",
};

const client = (data: unknown, error: { message: string } | null = null) => ({
  rpc: vi.fn(async () => ({ data, error })),
});

describe("rattachement submission → demande de transport", () => {
  it("retrouve la demande de transport rattachée depuis le CRM", async () => {
    const c = client(row);
    const res = await fetchLinkedTransportRequest(SUB, c);
    expect(res?.id).toBe(TR);
    expect(res?.submissionId).toBe(SUB);
    expect(res?.requestNumber).toBe("TR-2026-0007");
    expect(c.rpc).toHaveBeenCalledWith("get_submission_transport_request", {
      p_submission_id: SUB,
      p_stage: "transport_request",
    });
  });

  it("sans submission : aucune requête n'est envoyée", async () => {
    const c = client(row);
    const res = await fetchLinkedTransportRequest(null, c);
    expect(res).toBeNull();
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("aucune demande rattachée : retourne null (aucune création)", async () => {
    const res = await fetchLinkedTransportRequest(SUB, client(null));
    expect(res).toBeNull();
  });

  it("permission refusée : retourne null sans fausse confirmation", async () => {
    const res = await fetchLinkedTransportRequest(SUB, client(null, { message: "not_authorized" }));
    expect(res).toBeNull();
  });

  it("erreur DB : retourne null sans fausse confirmation", async () => {
    const res = await fetchLinkedTransportRequest(SUB, client(null, { message: "deadlock detected" }));
    expect(res).toBeNull();
  });

  it("idempotence : deux lectures successives donnent la même demande", async () => {
    const c = client(row);
    const a = await fetchLinkedTransportRequest(SUB, c);
    const b = await fetchLinkedTransportRequest(SUB, c);
    expect(a?.id).toBe(b?.id);
    expect(a?.submissionId).toBe(b?.submissionId);
  });

  it("reload : le submissionId est conservé dans la relation", async () => {
    const res = mapLinkedTransport({ ...row });
    expect(res?.submissionId).toBe(SUB);
    expect(res?.stage).toBe("transport_request");
  });

  it("réponse inattendue : aucune demande fabriquée", () => {
    expect(mapLinkedTransport(null)).toBeNull();
    expect(mapLinkedTransport({})).toBeNull();
    expect(mapLinkedTransport("nope")).toBeNull();
  });
});
