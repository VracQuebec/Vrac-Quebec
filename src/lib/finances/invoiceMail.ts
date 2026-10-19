import type { InvoicePdfData } from "./invoicePdf";

export type InvoiceMail = { to: string; subject: string; message: string };
export function defaultInvoiceMail(invoice: InvoicePdfData): InvoiceMail {
  return { to: invoice.client.email ?? "", subject: `Facture ${invoice.number ?? ""} — ${invoice.seller.name ?? ""}`,
    message: `Bonjour ${invoice.client.name ?? ""},\n\nVeuillez trouver ci-joint la facture ${invoice.number ?? ""}.${invoice.dueDate ? ` Échéance : ${invoice.dueDate}.` : ""}\n${invoice.terms ?? ""}\n\nMerci,\n${invoice.seller.name ?? ""}` };
}
export function validateInvoiceMail(mail: InvoiceMail) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.to.trim()) || /[\r\n]/.test(mail.to)) throw Error("Un destinataire valide est requis.");
  if (!mail.subject.trim() || /[\r\n]/.test(mail.subject) || mail.subject.length > 200) throw Error("Objet invalide.");
  if (!mail.message.trim() || mail.message.length > 10000) throw Error("Message requis (10 000 caractères maximum).");
  return { to: mail.to.trim().toLowerCase(), subject: mail.subject.trim(), message: mail.message.trim() };
}
/** Portable mail draft, never a send. Attachment is the existing snapshot PDF. */
export function invoiceMailDraft(mail: InvoiceMail, invoice: InvoicePdfData, pdfBase64: string): Blob {
  const m = validateInvoiceMail(mail);
  if (invoice.status !== "emise" || !invoice.number) throw Error("Émettez la facture avant de préparer son courriel.");
  const boundary = `invoice-${crypto.randomUUID()}`;
  const encoded = (s: string) => btoa(Array.from(new TextEncoder().encode(s), c => String.fromCharCode(c)).join(""));
  const wrap = (s: string) => s.match(/.{1,76}/g)?.join("\r\n") ?? "";
  const filename = `${invoice.number.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  return new Blob([`To: ${m.to}\r\nSubject: =?UTF-8?B?${encoded(m.subject)}?=\r\nX-Unsent: 1\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(encoded(m.message))}\r\n--${boundary}\r\nContent-Type: application/pdf; name="${filename}"\r\nContent-Disposition: attachment; filename="${filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(pdfBase64)}\r\n--${boundary}--\r\n`], { type: "message/rfc822" });
}