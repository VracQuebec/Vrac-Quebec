/** Reserved test identities never trigger external customer OR internal mail. */
export const isReservedTestEmail = (email: string) =>
  /@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$/i.test(email.trim());