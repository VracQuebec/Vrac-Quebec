import { describe, expect, it } from "vitest";
import { displayCategory, groupNotifications, sortNotifications, type CrmNotification } from "@/lib/notifications/api";

const notification = (overrides: Partial<CrmNotification>): CrmNotification => ({
  id: "n-1", dedupe_key: "n-1", category: "lead", type: "lead_new", priority: "normale",
  title: "Nouvelle demande", body: null, entity_type: "submission", entity_id: "e-1",
  entity_label: null, action_url: "/admin", client_name: null, lead_number: null, due_at: null,
  status: "unread", read_at: null, resolved_at: null, meta: {}, created_at: "2026-10-05T18:00:00Z",
  ...overrides,
});

describe("présentation du centre de notifications", () => {
  it("classe les notifications avec les références existantes", () => {
    expect(displayCategory(notification({ type: "transport_request_new", entity_type: "transport_request" }))).toBe("dompes");
    expect(displayCategory(notification({ title: "Besoin de remblai" }))).toBe("remblai");
    expect(displayCategory(notification({ type: "delivery_pending", category: "livraison" }))).toBe("transport");
    expect(displayCategory(notification({ type: "quote_todo", category: "soumission" }))).toBe("soumissions");
  });

  it("regroupe seulement les activités qui référencent la même entité", () => {
    const groups = groupNotifications([
      notification({ id: "a", entity_id: "same" }), notification({ id: "b", entity_id: "same", status: "read" }),
      notification({ id: "c", entity_id: null }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.key.endsWith(":same"))?.items).toHaveLength(2);
  });

  it("place urgent, prioritaire, à traiter, non lu, récent puis information", () => {
    const sorted = sortNotifications([
      notification({ id: "info", priority: "information", status: "read" }),
      notification({ id: "recent", priority: "normale", status: "read" }),
      notification({ id: "unread", priority: "normale", status: "unread" }),
      notification({ id: "todo", priority: "normale", status: "read", due_at: "2020-01-01T00:00:00Z" }),
      notification({ id: "important", priority: "importante", status: "read" }),
      notification({ id: "urgent", priority: "urgente", status: "read" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["urgent", "important", "todo", "unread", "recent", "info"]);
  });
});