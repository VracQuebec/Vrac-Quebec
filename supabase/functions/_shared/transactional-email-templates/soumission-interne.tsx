import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  quoteNumber?: string
  requestNumber?: string
  name?: string
  phone?: string
  email?: string
  material?: string
  quantity?: string
  trips?: string | number
  address?: string
  total?: string
  kind?: string
  notes?: string
  crmLink?: string
}

const Line = ({ label, value }: { label: string; value?: string | number }) => (
  <tr>
    <td style={th}>{label}</td>
    <td style={td}>{value !== undefined && value !== null && value !== '' ? String(value) : '—'}</td>
  </tr>
)

const InternalEmail = (p: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Nouvelle soumission {p.quoteNumber ?? ''} — {p.name ?? 'client'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>{p.kind === 'callback' ? 'Demande de rappel' : 'Nouvelle soumission'}</Heading>
          <Text style={subheader}>{p.quoteNumber ?? ''} {p.requestNumber ? `• ${p.requestNumber}` : ''}</Text>
        </Section>
        <table style={table as any} cellPadding={0} cellSpacing={0}>
          <tbody>
            <Line label="Client" value={p.name} />
            <Line label="Téléphone" value={p.phone} />
            <Line label="Courriel" value={p.email} />
            <Line label="Matériau" value={p.material} />
            <Line label="Quantité" value={p.quantity} />
            <Line label="Voyages" value={p.trips} />
            <Line label="Adresse" value={p.address} />
            <Line label="Total estimé" value={p.total} />
            <Line label="Notes" value={p.notes} />
          </tbody>
        </table>
        <Text style={footer}>{p.crmLink ?? 'https://vracquebec.ca/admin/soumissions'}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InternalEmail,
  subject: (data: Record<string, any>) =>
    `${data?.kind === 'callback' ? 'Rappel demandé' : 'Nouvelle soumission'} ${data?.quoteNumber ?? ''} — ${data?.name ?? 'client'}`,
  displayName: 'Soumission — notification interne',
  previewData: { quoteNumber: 'SOU-000123', name: 'Jean Tremblay', phone: '418-555-1234', total: '1 248,50 $' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '0', maxWidth: '600px', margin: '0 auto' }
const header = { backgroundColor: '#111111', padding: '20px', borderRadius: '12px 12px 0 0', textAlign: 'center' as const }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#7ED321', margin: '0' }
const subheader = { fontSize: '13px', color: '#ffffff', margin: '6px 0 0' }
const table = { width: '100%', borderCollapse: 'collapse' as const, margin: '0 0 16px' }
const th = { padding: '10px 12px', fontSize: '13px', color: '#6b7280', backgroundColor: '#f9fafb', width: '38%', borderBottom: '1px solid #e5e7eb' }
const td = { padding: '10px 12px', fontSize: '14px', color: '#111111', fontWeight: 'bold' as const, borderBottom: '1px solid #e5e7eb' }
const footer = { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, margin: '0 0 16px' }
