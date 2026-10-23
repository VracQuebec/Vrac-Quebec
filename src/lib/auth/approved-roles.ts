// Navigation hints only. Server RPCs/RLS remain the authority for every protected operation.
export function approvedRoleHints(rows: Array<{ role: string; approved: boolean | null }>): string[] {
  return rows.filter(row => row.approved === true).map(row => row.role);
}