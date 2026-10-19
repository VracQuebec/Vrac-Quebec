// Reuses real screens. Only localhost explicit test entry; no business-data provider or telemetry mounts.
import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Clients, Quotes, Projects } from "@/pages/EntrepreneurCrm";
import Invoices from "./Invoices";
import ContextHelp from "@/components/help/ContextHelp";

export default function FinanceLocalScreen() {
  const [session,setSession] = useState<{company:string;name:string;user:string}|null>(null);
  const [params,setParams] = useSearchParams();
  const navigate=useNavigate();
  useEffect(()=>{fetch("http://localhost:55445/session").then(r=>r.json()).then(setSession);},[]);
  if(!session)return <p className="p-6">Chargement du compte TEST…</p>;
  const finance = location.pathname.includes("finances"); const tab=params.get("tab")??"clients";
  return <main onClickCapture={e=>{const a=(e.target as HTMLElement).closest('a');if(a){const url=new URL(a.href);if(url.origin===location.origin){e.preventDefault();e.stopPropagation();url.searchParams.set('finance_test','local');navigate(url.pathname+url.search);}}}} className="mx-auto max-w-6xl p-4 sm:p-6"><header className="mb-5 border-b border-border pb-4"><p className="text-sm text-muted-foreground">Compte entrepreneur ordinaire · TEST local</p><h1 className="font-display text-2xl font-bold">{session.name}</h1><nav className="mt-3 flex flex-wrap gap-2">{[["clients","Clients"],["quotes","Soumissions"],["projects","Chantiers"],["factures","Factures et règlements"]].map(([t,l])=><Button key={t} variant="outline" asChild><Link to={`/entrepreneur/${t==='factures'?'finances':'crm'}?finance_test=local&tab=${t}`}>{l}</Link></Button>)}</nav></header>
    <div className="flex justify-end"><ContextHelp role="proprietaire" companyId={session.company} userId={session.user} articleId={finance?'facture':tab==='quotes'?'soumission':'clients'}/></div>
    {finance?<Invoices companyId={session.company} companyName={session.name} canWrite/>:tab==='quotes'?<Quotes companyId={session.company} companyName={session.name} canWrite/>:tab==='projects'?<Projects companyId={session.company} canWrite canFinance params={params} setParams={setParams}/>:<Clients companyId={session.company} canWrite canFinance params={params} setParams={setParams}/>}
  </main>;
}