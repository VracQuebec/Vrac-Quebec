import { describe, it, expect } from "vitest";
import { dueBucket, isOpenToday, sortOpenActions, countBuckets, outcomeLabel } from "@/lib/crm/followups";

const now = new Date("2026-09-16T14:00:00");

describe("CRM-03 — suivi quotidien", () => {
  it("classe une action échue, du jour et future", () => {
    expect(dueBucket("2026-09-15T09:00:00", now)).toBe("overdue");
    expect(dueBucket("2026-09-16T09:00:00", now)).toBe("today");
    expect(dueBucket("2026-09-16T23:00:00", now)).toBe("today");
    expect(dueBucket("2026-09-17T09:00:00", now)).toBe("later");
  });

  it("ne transforme jamais une date absente en date passée", () => {
    expect(dueBucket(null, now)).toBe("none");
    expect(dueBucket(undefined, now)).toBe("none");
    expect(dueBucket("pas une date", now)).toBe("none");
    expect(isOpenToday(null, now)).toBe(false);
  });

  it("retient les actions échues et du jour comme à traiter", () => {
    expect(isOpenToday("2026-09-10T09:00:00", now)).toBe(true);
    expect(isOpenToday("2026-09-16T18:00:00", now)).toBe(true);
    expect(isOpenToday("2026-09-20T09:00:00", now)).toBe(false);
  });

  it("ordonne les plus urgentes d'abord, de façon stable", () => {
    const rows = [
      { id: "b", next_follow_up_at: "2026-09-16T09:00:00" },
      { id: "a", next_follow_up_at: "2026-09-16T09:00:00" },
      { id: "c", next_follow_up_at: "2026-09-12T09:00:00" },
      { id: "d", next_follow_up_at: null },
    ];
    expect(sortOpenActions(rows).map((r) => r.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("compte exactement ce que la liste ouverte affiche", () => {
    const rows = [
      { next_follow_up_at: "2026-09-12T09:00:00" },
      { next_follow_up_at: "2026-09-16T09:00:00" },
      { next_follow_up_at: "2026-09-25T09:00:00" },
      { next_follow_up_at: null },
    ];
    expect(countBuckets(rows, now)).toEqual({ overdue: 1, today: 1, total: 2 });
  });

  it("une relance terminée sans prochaine date quitte la liste ouverte", () => {
    const after = { next_follow_up_at: null };
    expect(isOpenToday(after.next_follow_up_at, now)).toBe(false);
  });

  it("une relance terminée avec une date future quitte le jour mais reste planifiée", () => {
    const after = { next_follow_up_at: "2026-09-30T09:00:00" };
    expect(isOpenToday(after.next_follow_up_at, now)).toBe(false);
    expect(dueBucket(after.next_follow_up_at, now)).toBe("later");
  });

  it("libelle un résultat inconnu sans inventer de sens", () => {
    expect(outcomeLabel("joint")).toBe("Client rejoint");
    expect(outcomeLabel(null)).toBe("Action enregistrée");
  });
});
