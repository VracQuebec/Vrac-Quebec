import { describe, expect, it } from "vitest";
import { priorityLabel, sortByPriority, toNotificationPriority } from "@/lib/access-requests/priority";
import { sortNotifications, groupNotifications, matchesFilter, type CrmNotification } from "@/lib/notifications/api";

const n = (o: Partial<CrmNotification>): CrmNotification => ({
  id: "x", dedupe_key: "x", category: "lead", type: "transport_request_new", priority: "normale",
  title: "t", body: null, entity_type: "transport_request", entity_id: "e", entity_label: null,
  action_url: "/admin/demandes-acces?demande=e", client_name: null, lead_number: null, due_at: null,
  status: "unread", read_at: null, resolved_at: null, meta: {}, created_at: "2026-10-05T10:00:00Z", ...o,
});

describe("priorité des demandes d'accès", () => {
  it("n'invente jamais d'urgence : sans valeur = non définie", () => {
    expect(priorityLabel(null)).toBe("Priorité non définie");
    expect(toNotificationPriority(null)).toBeNull();
    expect(toNotificationPriority("normale")).toBeNull();
    expect(toNotificationPriority("urgente")).toBe("urgente");
    expect(toNotificationPriority("prioritaire")).toBe("importante");
  });
  it("trie urgente → prioritaire → normale, puis plus récente", () => {
    const rows = [
      { id: "old-n", created_at: "2026-10-01T00:00:00Z" },
      { id: "new-n", created_at: "2026-10-05T00:00:00Z" },
      { id: "p", created_at: "2026-09-01T00:00:00Z" },
      { id: "u", created_at: "2026-08-01T00:00:00Z" },
      { id: "undef", created_at: "2026-10-04T00:00:00Z" },
    ];
    const out = sortByPriority(rows, { u: "urgente", p: "prioritaire", "old-n": "normale", "new-n": "normale", undef: null }).map((r) => r.id);
    expect(out).toEqual(["u", "p", "new-n", "undef", "old-n"]);
  });
  it("une récente non urgente ne passe pas devant une urgente ancienne", () => {
    const s = sortNotifications([n({ id: "recent", created_at: "2026-10-05T12:00:00Z" }), n({ id: "urg", priority: "urgente", status: "read", created_at: "2026-01-01T00:00:00Z" })]);
    expect(s[0].id).toBe("urg");
  });
  it("regroupement : toutes les activités restent présentes", () => {
    const g = groupNotifications([n({ id: "a" }), n({ id: "b", status: "read" }), n({ id: "c" })]);
    expect(g).toHaveLength(1);
    expect(g[0].items.map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
  });
  it("filtres Urgentes et Informations", () => {
    expect(matchesFilter(n({ priority: "urgente" }), "urgent")).toBe(true);
    expect(matchesFilter(n({}), "urgent")).toBe(false);
    expect(matchesFilter(n({ priority: "information" }), "info")).toBe(true);
  });
});
