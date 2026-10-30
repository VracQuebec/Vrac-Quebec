// Server-owned signup grant: never accept a role or approval flag from the request.
export function entrepreneurSignupRole(userId: string) {
  return { user_id: userId, role: "entrepreneur", approved: true };
}