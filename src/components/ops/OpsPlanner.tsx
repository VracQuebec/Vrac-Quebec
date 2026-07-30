// Planificateur : vue jour / semaine / mois avec glisser-déposer.
import { useMemo, useState } from "react";
import { Delivery, OpsRefs, statusMeta, priorityMeta, todayISO } from "@/lib/jsc/operations";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

type Mode = "jour" | "semaine" | "mois";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const startOfWeek = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return addDays(iso, -((d.getDay() + 6) % 7));
};
const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" });

interface Props {
  deliveries: Delivery[];
  refs: OpsRefs;
  onOpen: (d: Delivery) => void;
  onReschedule: (id: string, date: string) => void;
}

export default function OpsPlanner({ deliveries, refs, onOpen, onReschedule }: Props) {
  const [mode, setMode] = useState<Mode>("semaine");
  const [anchor, setAnchor] = useState(todayISO());
  const [dragId, setDragId] = useState<string | null>(null);

  const days = useMemo(() => {
    if (mode === "jour") return [anchor];
    if (mode === "semaine") return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const d = new Date(`${anchor}T12:00:00`);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const count = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => addDays(first.toISOString().slice(0, 10), i));
  }, [mode, anchor]);

  const step = mode === "jour" ? 1 : mode === "semaine" ? 7 : 30;
  const clientName = (id?: string | null) => refs.clients.find((c) => c.id === id)?.name ?? "Client";
  const truckName = (id?: string | null) => refs.trucks.find((t) => t.id === id)?.name;

  const unplanned = deliveries.filter((d) => !d.scheduled_date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAnchor(addDays(anchor, -step))}><ChevronLeft className="w-4 h-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setAnchor(todayISO())}><CalendarDays className="w-4 h-4 mr-1" /> Aujourd'hui</Button>
        <Button variant="outline" size="sm" onClick={() => setAnchor(addDays(anchor, step))}><ChevronRight className="w-4 h-4" /></Button>
        <div className="flex gap-1 ml-2">
          {(["jour", "semaine", "mois"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase border ${mode === m ? "bg-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground"}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground ml-auto">Glissez une livraison sur un jour pour la replanifier.</div>
      </div>

      {unplanned.length > 0 && (
        <div className="rounded-xl border border-dashed border-border p-3 bg-secondary/20">
          <div className="text-[11px] uppercase font-display font-bold text-muted-foreground mb-2">À planifier ({unplanned.length})</div>
          <div className="flex flex-wrap gap-2">
            {unplanned.map((d) => (
              <div key={d.id} draggable onDragStart={() => setDragId(d.id)} onClick={() => onOpen(d)}
                className="px-2 py-1 rounded-lg bg-card border border-border text-[11px] cursor-grab active:cursor-grabbing">
                <b>{d.delivery_number ?? "LIV"}</b> · {clientName(d.client_id)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`grid gap-2 ${mode === "jour" ? "grid-cols-1" : mode === "semaine" ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-7" : "grid-cols-2 md:grid-cols-4 lg:grid-cols-7"}`}>
        {days.map((day) => {
          const items = deliveries.filter((d) => d.scheduled_date === day);
          return (
            <div key={day}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) { onReschedule(dragId, day); setDragId(null); } }}
              className={`rounded-xl border border-border bg-card p-2 min-h-[120px] ${day === todayISO() ? "ring-2 ring-primary/50" : ""}`}>
              <div className="text-[10px] uppercase font-display font-bold text-muted-foreground mb-1.5">{fmtDay(day)}</div>
              <div className="space-y-1.5">
                {items.map((d) => {
                  const st = statusMeta(d.status);
                  const pr = priorityMeta(d.priority);
                  return (
                    <div key={d.id} draggable onDragStart={() => setDragId(d.id)} onClick={() => onOpen(d)}
                      className="rounded-lg p-1.5 text-[10px] cursor-pointer border-l-4 bg-secondary/40 hover:bg-secondary"
                      style={{ borderColor: pr.color }}>
                      <div className="flex items-center justify-between gap-1">
                        <b className="truncate">{d.scheduled_time ? d.scheduled_time.slice(0, 5) : "—"} {clientName(d.client_id)}</b>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} />
                      </div>
                      <div className="text-muted-foreground truncate">{d.city ?? ""}{truckName(d.truck_id) ? ` · ${truckName(d.truck_id)}` : ""}</div>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="text-[10px] text-muted-foreground italic">Libre</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}