// Feuilles imprimables d'un carnet : un coupon par voyage-journée, 3 exemplaires.
// Le client trace les voyages par groupes de cinq, puis confirme le total avec le chauffeur.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type Book = Database["public"]["Tables"]["cpn_books"]["Row"];
const COPIES = ["Exemplaire client", "Exemplaire chauffeur / entrepreneur", "Exemplaire Vrac Québec (photo dans le compte)"];

export default function AdminCouponPrint() {
  const { id } = useParams();
  const [b, setB] = useState<Book | null>(null);
  useEffect(() => { void supabase.from("cpn_books").select("*").eq("id", id!).maybeSingle().then(({ data }) => setB(data)); }, [id]);
  if (!b) return <p className="p-8 text-muted-foreground">Chargement…</p>;
  const nums = Array.from({ length: Math.min(b.coupon_count, 200) }, (_, i) => b.first_coupon + i);

  return (
    <div className="bg-background p-4 text-foreground print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">Carnet {b.book_number} — gabarit pour impression autocopiante (3 exemplaires).</p>
        <Button onClick={() => window.print()}>Imprimer</Button>
      </div>
      {nums.map((n) => (
        <section key={n} className="mb-4 break-inside-avoid rounded border border-foreground/40 p-3 text-xs print:mb-2">
          <div className="flex justify-between font-bold"><span>VRAC QUÉBEC — Coupon de voyages</span><span>N° {n} · {b.book_number}</span></div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {["Date", "Entrepreneur", "Chauffeur", "Camion (n° / plaque)"].map((l) => (
              <div key={l} className="border-b border-foreground/40 pb-3">{l}</div>
            ))}
          </div>
          <div className="mt-3">Voyages reçus (barres par groupes de 5 : ||||/) :</div>
          <div className="mt-1 grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-8 border border-foreground/30" />)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div className="border-b border-foreground/40 pb-3">Total du jour</div>
            <div className="border-b border-foreground/40 pb-3">Signature client</div>
            <div className="border-b border-foreground/40 pb-3">Signature chauffeur</div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Un coupon par entrepreneur et par jour. {COPIES.join(" · ")}.</p>
        </section>
      ))}
    </div>
  );
}
