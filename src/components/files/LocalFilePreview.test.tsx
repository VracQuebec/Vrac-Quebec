import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LocalFilePreview from "./LocalFilePreview";

describe("aperçus locaux sans fuite mémoire", () => {
  it("réutilise l'URL au rendu et la libère au remplacement/fermeture", async () => {
    const create = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const file = new File(["first"], "first.jpg", { type: "image/jpeg" });
    const next = new File(["second"], "second.jpg", { type: "image/jpeg" });
    const view = render(<LocalFilePreview file={file} />);
    view.rerender(<LocalFilePreview file={file} className="changed" />);
    expect(create).toHaveBeenCalledTimes(1);
    view.rerender(<LocalFilePreview file={next} />);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:first"));
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:second");
    vi.unstubAllGlobals();
  });
});