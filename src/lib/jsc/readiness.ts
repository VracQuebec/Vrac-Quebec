// Mise en service de la plateforme : état de configuration, validation et mode.
import { supabase } from "@/integrations/supabase/client";

export interface ReadinessStep {
  id: string; resource: string; label: string; count: number; min: number;
}
export interface ReadinessIssue {
  severity: "critical" | "warning"; code: string; label: string;
  count: number; detail: string; resource: string;
}
export interface ReadinessFlowStep { id: string; label: string; count: number }

export interface Readiness {
  mode: "test" | "production";
  steps: ReadinessStep[];
  steps_done: number;
  steps_total: number;
  score: number;
  issues: ReadinessIssue[];
  critical_count: number;
  flow: ReadinessFlowStep[];
  production_ready: boolean;
  generated_at: string;
}

type RpcFn = (fn: string, args?: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc as unknown as RpcFn;

export async function fetchReadiness(companyId?: string | null): Promise<Readiness> {
  const { data, error } = await rpc("jsc_readiness", { _company_id: companyId ?? undefined });
  if (error) throw new Error(error.message);
  return data as Readiness;
}

export async function setPlatformMode(mode: "test" | "production") {
  const { error } = await supabase
    .from("jsc_settings")
    .update({ value: mode })
    .eq("key", "platform_mode");
  if (error) throw new Error(error.message);
}

export const stepIsDone = (s: ReadinessStep) => s.count >= s.min;
