import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import AgendaBoard from "@/components/agenda/AgendaBoard";
import { useCompanyRole } from "@/components/todo/useCompanyRole";

export default function EntrepreneurAgenda() {
  const { companies, companyId, setCompanyId, role, ready } = useCompanyRole();
  return (
    <EntrepreneurAppShell title="Agenda" subtitle={companies.find((c) => c.id === companyId)?.name ?? ""} backTo={null} allowCompanyMembers>
      {companies.length > 1 && (
        <select aria-label="Entreprise active" className="mb-4 h-10 w-full rounded-md border border-border bg-background px-2 text-sm sm:w-auto" value={companyId ?? ""} onChange={(e) => setCompanyId(e.target.value)}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {!ready ? <p className="text-muted-foreground">Chargement…</p>
        : !companyId ? <p className="text-muted-foreground">Aucune entreprise accessible.</p>
        : role === null ? <p className="text-muted-foreground">Vérification des droits…</p>
        : role === "aucun" ? <p className="text-muted-foreground">Accès refusé pour cette entreprise.</p>
        : <AgendaBoard key={companyId} companyId={companyId} role={role} />}
    </EntrepreneurAppShell>
  );
}
