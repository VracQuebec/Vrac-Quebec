// ============================================================
// VRAC QUÉBEC OS — POINT D'ENTRÉE UNIQUE DES CALCULS
// ------------------------------------------------------------
// Il n'existe qu'un seul moteur de calcul sur la plateforme :
// le moteur Transport JSC (`runCarrierQuote`). Site public, CRM,
// assistant, API et futurs canaux passent tous par ici, ce qui
// garantit un résultat identique quel que soit le module utilisé.
// ============================================================
export * from "./core.ts";
export * from "./supply.ts";
export * from "./jsc-engine.ts";
export { runCarrierQuote as runQuote } from "./jsc-engine.ts";
export type { JscQuoteResult as QuoteResult } from "./jsc-engine.ts";
