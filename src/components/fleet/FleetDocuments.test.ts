import { describe, it, expect, vi } from "vitest";
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fleet/api", () => ({ uploadDocument: upload }));
import { uploadPendingDocuments } from "./FleetDocuments";

describe("fichiers flotte originaux", () => {
  it("trois envois maximum, chaque original une fois, échec individuel conservé", async () => {
    let active = 0, peak = 0;
    upload.mockImplementation(async (_type, _id, file: File) => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      if (file.name === "preuve-2.pdf") throw new Error("Refus TEST");
    });
    const files = Array.from({ length: 6 }, (_, i) => new File([`original-${i}`], `preuve-${i}.pdf`, { type: "application/pdf" }));
    const result = await uploadPendingDocuments("fleet_vehicle", "TEST", files);
    expect(peak).toBe(3);
    expect(upload).toHaveBeenCalledTimes(6);
    files.forEach(file => expect(upload).toHaveBeenCalledWith("fleet_vehicle", "TEST", file, "document"));
    expect(result).toEqual({ ok: 5, errors: ["preuve-2.pdf : Refus TEST"] });
  });
});