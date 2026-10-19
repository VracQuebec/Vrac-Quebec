import { describe, it, expect, vi } from "vitest";
import { makeHandler } from "../../prepared/exec01/handler";
import type { RemblaiService } from "@/lib/remblai/service";
describe("EXEC-01 prepared server transport", () => {
  function fixture() {
    const service = { read: vi.fn(), requestCode: vi.fn(), verifyCode: vi.fn(), act: vi.fn() };
    const send = vi.fn();
    return { service, send, handler: makeHandler(service as unknown as RemblaiService, send) };
  }
  it("GET scanner never invokes read or any mutation", async () => {
    const f = fixture(); const res = await f.handler(new Request("http://localhost/portal", { method: "GET" }));
    expect(res.status).toBe(200); for (const fn of Object.values(f.service)) expect(fn).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
  });
  it("POST requires explicit true confirmation", async () => {
    const f = fixture(); const res = await f.handler(new Request("http://localhost/portal", { method: "POST", body: JSON.stringify({ kind: "act", linkId: "a", requestId: "b", secret: "x".repeat(64), confirmed: false, action: "pause", operationId: "operation-00000000001", version: 1 }) }));
    expect(res.status).toBe(400); expect(f.service.act).not.toHaveBeenCalled();
  });
  it("invalid payload does not leak body or credential", async () => {
    const f = fixture(); const res = await f.handler(new Request("http://localhost/portal", { method: "POST", body: '{"secret":"fictional-value"}' }));
    expect(res.status).toBe(400); expect(await res.text()).not.toContain("fictional-value");
  });
  it("server errors are projected without private details", async () => {
    const f = fixture(); f.service.read.mockRejectedValue(new Error("private dossier detail"));
    const res = await f.handler(new Request("http://localhost/portal", { method: "POST", body: JSON.stringify({ kind: "read", linkId: "a", requestId: "b", secret: "x".repeat(64) }) }));
    expect(res.status).toBe(403); expect(await res.text()).not.toContain("private dossier detail");
  });
});