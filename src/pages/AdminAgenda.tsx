import PageHeader from "@/components/layout/PageHeader";
import AgendaBoard from "@/components/agenda/AgendaBoard";
import { useCompanyRole } from "@/components/todo/useCompanyRole";

export default function AdminAgenda() {
  const { companies, companyId, setCompanyId, role, ready, isAdmin, loading } = useCompanyRole("vq.admin.todo.company");
  if (loading) return <p className="p-8 text-muted-foreground">Chargement…</p>;
  if (!isAdmin) return <p className="p-8 text-muted-foreground">Accès réservé à l’équipe Vrac Québec.</p>;
  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Agendas des entreprises" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <select aria-label="Entreprise" className="mb-4 h-10 w-full rounded-md border border-border bg-background px-2 text-sm sm:w-auto" value={companyId ?? ""} onChange={(e) => setCompanyId(e.target.value)}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!ready || !companyId || role === null ? <p className="text-muted-foreground">Chargement…</p> : <AgendaBoard key={companyId} companyId={companyId} role={role} />}
      </main>
    </div>
  );
}
