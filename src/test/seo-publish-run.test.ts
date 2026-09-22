import { describe, it, expect } from "vitest";
import {
  PUBLISH_BATCH_SIZE, EMPTY_TALLY, applyOutcome, batchCount, batchNumber, chunk,
  confirmationLines, decideForPage, elapsedLabel, finalReport, isPublishable,
  progressPct, selectPublishable, successSentence, SKIP_LABEL, type PublishRow,
} from "@/lib/seo/publishRun";

const LONG = "Vrac Québec coordonne la livraison de gravier à Québec avec des fournisseurs vérifiés et un transport planifié selon votre chantier local.";

function page(over: Partial<PublishRow> = {}): PublishRow {
  return {
    id: over.id ?? "id-1",
    slug: over.slug ?? "gravier-quebec",
    city_slug: over.city_slug ?? "quebec",
    material_slug: over.material_slug ?? "gravier",
    service_slug: over.service_slug ?? null,
    title: over.title ?? "Gravier à Québec — livraison de matériaux en vrac",
    h1: over.h1 ?? "Gravier à Québec",
    status: over.status ?? "draft",
    meta_title: over.meta_title ?? "Gravier à Québec — livraison de matériaux en vrac",
    meta_description: over.meta_description ?? LONG,
    content_html: over.content_html ??
      `<p>${"Le gravier à Québec est livré par nos partenaires. ".repeat(40)}</p><a href="/soumission">Demander une soumission</a>`,
    word_count: over.word_count ?? 400,
    internal_link_count: over.internal_link_count ?? 3,
    internal_links: over.internal_links ?? [],
    qa_last_score: over.qa_last_score ?? 92,
    qa_last_checked_at: over.qa_last_checked_at ?? new Date().toISOString(),
    qa_blockers: over.qa_blockers ?? [],
    proc_status: over.proc_status ?? null,
    proc_error: over.proc_error ?? null,
    priority_locked: over.priority_locked ?? false,
    last_generated_at: over.last_generated_at ?? new Date().toISOString(),
  } as PublishRow;
}

describe("sélection des pages publiables", () => {
  it("accepte un brouillon validé", () => expect(isPublishable(page())).toBe(true));
  it("refuse une page déjà publiée", () => expect(isPublishable(page({ status: "published" }))).toBe(false));
  it("refuse une page verrouillée", () => expect(isPublishable(page({ priority_locked: true }))).toBe(false));
  it("refuse une page avec bloqueur QA", () => expect(isPublishable(page({ qa_blockers: ["meta"] }))).toBe(false));
  it("refuse un titre trop court", () => expect(isPublishable(page({ meta_title: "Gravier Québec" }))).toBe(false));
  it("refuse un contenu trop court", () => expect(isPublishable(page({ word_count: 120 }))).toBe(false));
  it("refuse une page sans CTA", () => expect(isPublishable(page({ content_html: `<p>${"Gravier à Québec. ".repeat(60)}</p>` }))).toBe(false));
  it("refuse un titre en double", () => expect(isPublishable(page(), true)).toBe(false));
  it("ne retient que les candidats publiables", () => {
    const list = selectPublishable([page(), page({ id: "id-2", slug: "x", status: "published" })]);
    expect(list.map((c) => c.id)).toEqual(["id-1"]);
    expect(list[0].topic).toBe("gravier");
  });
  it("ignore une ligne sans identifiant", () => expect(selectPublishable([page({ id: undefined })])).toHaveLength(0));
});

describe("décision juste avant écriture", () => {
  it("publie une page encore prête", () => expect(decideForPage(page())).toBe("publish"));
  it("ignore une page déjà publiée", () => expect(decideForPage(page({ status: "published" }))).toBe("already_published"));
  it("ignore une page disparue", () => expect(decideForPage(null)).toBe("status_changed"));
  it("ignore un autre statut", () => expect(decideForPage(page({ status: "archived" }))).toBe("status_changed"));
  it("ignore une page en erreur", () => expect(decideForPage(page({ proc_error: "boom" }))).toBe("has_error"));
  it("ignore une page qui n'est plus prête", () => expect(decideForPage(page({ internal_link_count: 0 }))).toBe("not_ready"));
  it("nomme chaque raison d'exclusion", () => expect(Object.keys(SKIP_LABEL)).toHaveLength(4));
});

describe("lots et progression", () => {
  it("découpe par 25 par défaut", () => {
    const items = Array.from({ length: 514 }, (_, i) => i);
    const b = chunk(items);
    expect(PUBLISH_BATCH_SIZE).toBe(25);
    expect(b).toHaveLength(21);
    expect(b[20]).toHaveLength(14);
  });
  it("compte les lots", () => expect(batchCount(514)).toBe(21));
  it("numérote le lot courant", () =>
    expect(batchNumber({ ...EMPTY_TALLY, processed: 25 })).toBe(2));
  it("cumule les issues sans double comptage", () => {
    let t = EMPTY_TALLY;
    t = applyOutcome(t, "published");
    t = applyOutcome(t, "already_published");
    t = applyOutcome(t, "not_ready");
    t = applyOutcome(t, "failed");
    expect(t).toEqual({ published: 1, alreadyPublished: 1, skipped: 1, failed: 1, processed: 4 });
  });
  it("calcule un pourcentage borné", () => {
    expect(progressPct({ ...EMPTY_TALLY, processed: 125 }, 514)).toBe(24);
    expect(progressPct(EMPTY_TALLY, 0)).toBe(0);
  });
  it("affiche le temps écoulé", () => {
    expect(elapsedLabel(0, 45_000)).toBe("45 s");
    expect(elapsedLabel(0, 135_000)).toBe("2 min 15 s");
  });
});

describe("confirmation et rapport", () => {
  it("annonce le nombre réel de pages", () => {
    const lines = confirmationLines({ ready: 514, alreadyPublished: 835, excluded: 0, errors: 0, toCheck: 0 });
    expect(lines[0]).toContain("514");
    expect(lines.join(" ")).toContain("835");
  });
  it("utilise le restant relu en base, pas une soustraction", () => {
    const r = finalReport({ published: 500, alreadyPublished: 2, skipped: 10, failed: 2, processed: 514 }, 12);
    expect(r).toEqual(["500 page(s) publiée(s)", "2 déjà publiée(s)", "10 ignorée(s)", "2 échec(s)", "12 restante(s) à publier"]);
  });
  it("confirme le succès complet uniquement si rien ne reste", () => {
    expect(successSentence({ ...EMPTY_TALLY, published: 514 }, 0)).toContain("succès");
    expect(successSentence({ ...EMPTY_TALLY, published: 500, failed: 1 }, 0)).toBeNull();
    expect(successSentence({ ...EMPTY_TALLY, published: 500 }, 14)).toBeNull();
  });
});
