// Numérotation des demandes d'accès : testée dans une base isolée en mémoire
// avec la vraie migration (aucun accès aux données de production).
import { describe, expect, it, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../..");
const setup = fs.readFileSync(path.join(__dirname, "fixtures/access-request-numbering-setup.sql"), "utf8");
const migration = fs
  .readFileSync(path.join(root, "drizzle/migrations/0224_access_request_gapless_numbering.sql"), "utf8")
  .replace(/^GRANT.*$/gm, "")
  .replace(/--> statement-breakpoint/g, "");

let db: PGlite;
const counter = async () =>
  (await db.query<{ last_value: number }>("select last_value from transport_request_number_counter")).rows[0].last_value;
const insert = async (email: string) =>
  (await db.query<{ request_number: string }>(
    "insert into transport_requests(client_email) values($1) returning request_number", [email],
  )).rows[0].request_number;

beforeEach(async () => {
  db = await PGlite.create();
  await db.exec(setup);
  await db.exec(migration);
}, 30000);

describe("numérotation des demandes d'accès", () => {
  it("reprend le compteur à 54 et la prochaine demande valide reçoit #0055", async () => {
    expect(await counter()).toBe(54);
    expect(await insert("v@x.ca")).toBe("DT-0055");
  });

  it("une demande refusée par les validations ne consomme aucun numéro", async () => {
    await expect(insert("mauvais")).rejects.toThrow();
    expect(await counter()).toBe(54);
  });

  it("un enregistrement échoué ne consomme aucun numéro", async () => {
    await expect(db.query("insert into transport_requests(fail_after) values(true)")).rejects.toThrow();
    expect(await counter()).toBe(54);
    expect(await insert("v@x.ca")).toBe("DT-0055");
  });

  it("des demandes simultanées obtiennent des numéros uniques et consécutifs", async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) =>
      db.transaction(async (tx) => { await tx.query("insert into transport_requests(client_email) values($1)", [`a${i}@x.ca`]); })));
    const r = (await db.query<{ n: number; d: number; mi: string; ma: string }>(
      "select count(*)::int n, count(distinct request_number)::int d, min(request_number) mi, max(request_number) ma from transport_requests where client_email like 'a%@x.ca'",
    )).rows[0];
    expect(r).toEqual({ n: 10, d: 10, mi: "DT-0055", ma: "DT-0064" });
  });

  it("les 12 demandes existantes gardent leurs numéros", async () => {
    const r = (await db.query<{ s: string }>(
      "select string_agg(request_number, ',' order by request_number) s from transport_requests",
    )).rows[0];
    expect(r.s).toBe("DT-0003,DT-0004,DT-0026,DT-0027,DT-0028,DT-0029,DT-0032,DT-0050,DT-0051,DT-0052,DT-0053,DT-0054");
  });
});
