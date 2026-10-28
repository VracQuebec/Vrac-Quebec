import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ file: null as any, link: null as any, uploads: 0, inserts: 0, linkAttempts: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: async () => { state.uploads++; return { error: null }; } }) },
  from: (table: string) => {
    let operation = "read", payload: any;
    const result = () => {
      if (table === "ent_crm_files" && operation === "insert") { state.inserts++; state.file = { id: payload.id, ...payload }; return { data: state.file, error: null }; }
      if (table === "ent_crm_files") return { data: state.file, error: null };
      if (operation === "insert") {
        state.linkAttempts++;
        if (state.linkAttempts === 1) return { error: { message: "Interruption TEST" } };
        state.link = { id: payload.id, file: state.file }; return { error: null };
      }
      return { data: state.link ? [state.link] : [], error: null };
    };
    const q: any = { select: () => q, eq: () => q, order: () => q,
      insert: (p: any) => { operation = "insert"; payload = p; return q; },
      single: async () => result(), maybeSingle: async () => ({ data: state.link, error: null }),
      then: (yes: any, no: any) => Promise.resolve(result()).then(yes, no) };
    return q;
  },
} }));
import CrmFiles from "./CrmFiles";

describe("reprise de pièce CRM", () => {
  it("reprend seulement le rattachement après échec, un original et une fiche", async () => {
    Object.assign(state, { file: null, link: null, uploads: 0, inserts: 0, linkAttempts: 0 });
    const view = render(<CrmFiles companyId="TEST" ownerType="client" ownerId="TEST-client" canWrite canAdmin={false} />);
    const input = view.container.querySelector('input[type="file"][multiple]');
    if (!input) throw Error("file input missing");
    fireEvent.change(input, { target: { files: [new File(["original"], "preuve.pdf", { type: "application/pdf" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull());
    expect(state.uploads).toBe(1);
    expect(state.inserts).toBe(1);
    expect(state.linkAttempts).toBe(2);
    view.unmount();
  });
});