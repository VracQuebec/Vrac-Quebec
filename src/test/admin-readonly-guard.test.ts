import { describe, it, expect, afterEach } from "vitest";
import { setAdminReadonly } from "@/lib/admin-readonly/guard";

// Lecture seule : les commandes sont figées selon leur action réelle, pas seulement leur libellé.
describe("verrou d'interface lecture seule", () => {
  afterEach(() => { setAdminReadonly(false); document.body.innerHTML = ""; });

  it("désactive une case « terminer la tâche » sans libellé d'écriture", () => {
    document.body.innerHTML = `<button role="checkbox" aria-label="Cocher Rappeler le client"></button>`;
    setAdminReadonly(true);
    expect((document.querySelector("[role=checkbox]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("fige les choix de couleur d'une fiche ouverte", () => {
    document.body.innerHTML = `<div role="dialog"><button aria-pressed="false" aria-label="Vert"></button></div>`;
    setAdminReadonly(true);
    expect((document.querySelector("[aria-pressed]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("laisse actifs les filtres explicitement nommés", () => {
    document.body.innerHTML = `<input type="checkbox" aria-label="Filtrer les tâches ouvertes" />`;
    setAdminReadonly(true);
    expect((document.querySelector("input") as HTMLInputElement).disabled).toBe(false);
  });

  it("désactive un bouton « Enregistrer »", () => {
    document.body.innerHTML = `<button>Enregistrer</button>`;
    setAdminReadonly(true);
    expect((document.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
