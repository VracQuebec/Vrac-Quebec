import { describe, it, expect } from "vitest";
import { entrepreneurSignupRole } from "../../supabase/functions/signup-entrepreneur/role";
import { approvedRoleHints } from "@/lib/auth/approved-roles";

describe("inscription entrepreneur sans approbation manuelle", () => {
  it("attribue automatiquement le seul rôle entrepreneur actif", () => {
    expect(entrepreneurSignupRole("test-user")).toEqual({ user_id: "test-user", role: "entrepreneur", approved: true });
  });
  it("la suspension explicite continue de retirer les accès", () => {
    expect(approvedRoleHints([{role: "entrepreneur", approved: false}])).toEqual([]);
  });
  it("l’inscription ne donne jamais de rôle admin", () => {
    expect(approvedRoleHints([entrepreneurSignupRole("test-user")])).not.toContain("admin");
  });
});
import { decideSignup, confirmRedirect, SIGNUP_EMAIL_CONFIRMED, SIGNUP_ACCEPTS_PASSWORD, unusablePassword } from "../../supabase/functions/signup-entrepreneur/role";
import { isServiceCaller } from "../../supabase/functions/send-transactional-email/service-caller";

describe("inscription : courriel prouvé avant activation", () => {
  const pending = { id: "u1", confirmed: false, requestedEntrepreneur: true, hasOtherRoles: false };
  it("le serveur ne confirme jamais le courriel lui-même", () => { expect(SIGNUP_EMAIL_CONFIRMED).toBe(false); });
  it("nouvelle adresse : création", () => { expect(decideSignup(null, null)).toBe("create"); });
  it("compte confirmé existant : refus", () => { expect(decideSignup({ ...pending, confirmed: true }, null)).toBe("conflict"); });
  it("compte avec rôle admin : refus même non confirmé", () => { expect(decideSignup({ ...pending, hasOtherRoles: true }, null)).toBe("conflict"); });
  it("fiche entrepreneur liée à un autre compte : refus", () => { expect(decideSignup(pending, "u2")).toBe("conflict"); expect(decideSignup(null, "u2")).toBe("conflict"); });
  it("inscription en attente : nouvel envoi du lien", () => { expect(decideSignup(pending, "u1")).toBe("resend_pending"); });
  it("redirection limitée aux domaines du site", () => {
    expect(confirmRedirect("https://evil.example")).toBe("https://vracquebec.ca/reset-password?bienvenue=entrepreneur");
    expect(confirmRedirect("https://www.vracquebec.ca")).toBe("https://www.vracquebec.ca/reset-password?bienvenue=entrepreneur");
  });
});

describe("courriels privilégiés réservés aux fonctions serveur", () => {
  it("refuse la clé publique, une session ou un jeton inventé", () => {
    expect(isServiceCaller("anon-key", "service-key")).toBe(false);
    expect(isServiceCaller("n'importe-quoi", "service-key")).toBe(false);
    expect(isServiceCaller("", "")).toBe(false);
  });
  it("accepte seulement la clé de service exacte", () => { expect(isServiceCaller("service-key", "service-key")).toBe(true); });
});

describe("inscription : mot de passe choisi seulement par le titulaire de la boîte", () => {
  it("le serveur n'accepte aucun mot de passe de l'initiateur", () => { expect(SIGNUP_ACCEPTS_PASSWORD).toBe(false); });
  it("une reprise reçoit un secret aléatoire, différent à chaque fois", () => {
    const a = unusablePassword(), b = unusablePassword();
    expect(a).not.toBe(b); expect(a.length).toBeGreaterThan(60);
  });
});
