import { beforeEach, describe, expect, it } from "vitest";
import { progressKey, readProgress, recordAction } from "@/lib/help/progress";
beforeEach(() => localStorage.clear());
describe("reprise de l’aide — stockage appareil seulement", () => {
  it("répare une progression null et enregistre une action réelle", () => {
    localStorage.setItem(progressKey("test-user", "test-company"), JSON.stringify({ completed: null }));
    recordAction("test-user", "test-company", "search");
    expect(readProgress("test-user", "test-company").completed.search).toBeDefined();
  });
  it("ne reprend ni clés inconnues ni dates invalides ni un tableau", () => {
    localStorage.setItem(progressKey("u", "c"), JSON.stringify({ paused: "yes", completed: { search: "bad", admin: "2026-10-23T17:00:00Z", client: "2026-10-23T17:00:00Z" } }));
    expect(readProgress("u", "c")).toEqual({ paused: false, completed: { client: "2026-10-23T17:00:00Z" } });
    localStorage.setItem(progressKey("u", "c"), '{"completed":[]}');
    expect(readProgress("u", "c")).toEqual({ paused: false, completed: {} });
  });
  it("ne partage pas la progression entre entreprises", () => {
    recordAction("u", "a", "punch");
    expect(readProgress("u", "b").completed).toEqual({});
  });
});