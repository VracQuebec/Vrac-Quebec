// Sélecteur d'entreprise + bandeau « Mode support Vrac Québec ».
// Le Super Admin Vrac Québec peut ouvrir l'environnement complet
// d'une entreprise cliente; l'entreprise, elle, ne voit que la sienne.
import { Building2, LifeBuoy } from "lucide-react";
import { companyRoleLabel, type FleetTenant } from "@/lib/fleet/tenant";

export function CompanySwitcher({ tenant }: { tenant: FleetTenant }) {
  if (tenant.loading || tenant.companies.length === 0) return null;

  if (tenant.companies.length === 1) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-body text-muted-foreground">
        <Building2 className="w-4 h-4 shrink-0" />
        <span className="truncate max-w-[10rem]">{tenant.companies[0].name}</span>
      </div>
    );
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">Entreprise</span>
      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
      <select
        value={tenant.companyId ?? ""}
        onChange={(e) => tenant.select(e.target.value)}
        className="h-9 rounded-lg border border-border bg-background px-2 text-sm font-body max-w-[12rem]"
      >
        {tenant.companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  );
}

export function SupportBanner({ tenant }: { tenant: FleetTenant }) {
  if (!tenant.supportMode || !tenant.company) return null;
  return (
    <div
      role="status"
      className="bg-amber-500/15 border-b border-amber-500/40 text-amber-700 dark:text-amber-400"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-2 text-xs sm:text-sm font-body">
        <LifeBuoy className="w-4 h-4 shrink-0" aria-hidden />
        <span className="font-semibold uppercase tracking-wide">Mode support Vrac Québec</span>
        <span aria-hidden>—</span>
        <span className="truncate">Entreprise : {tenant.company.name}</span>
        {tenant.role && (
          <span className="hidden sm:inline text-muted-foreground">· Votre rôle : {companyRoleLabel(tenant.role)}</span>
        )}
      </div>
    </div>
  );
}
