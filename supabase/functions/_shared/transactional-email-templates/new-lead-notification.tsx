import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface NewLeadProps {
  name?: string
  phone?: string
  email?: string
  address?: string
  postalCode?: string
  materials?: string
  quantity?: string | number
  budget?: string
  notes?: string
  dompeNumber?: string | number
  submissionNumber?: string | number
  submittedAt?: string
  deliveryDeadline?: string
  crmLink?: string
}

const Row = ({ label, value }: { label: string; value?: string | number }) => (
  <tr>
    <td style={th}>{label}</td>
    <td style={td}>{value !== undefined && value !== null && value !== '' ? String(value) : '—'}</td>
  </tr>
)

const NewLeadEmail = ({
  name, phone, email, address, postalCode, materials, quantity,
  budget, notes, dompeNumber, submissionNumber, submittedAt, deliveryDeadline, crmLink,
}: NewLeadProps) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Nouveau lead Vrac Québec — {name || 'client'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>🚛 Nouveau lead Vrac Québec Simple</Heading>
          <Text style={subheader}>
            Soumission #{submissionNumber ?? '—'}{dompeNumber ? ` • DOMPE ${dompeNumber}` : ''}
          </Text>
        </Section>
        <table style={table as any} cellPadding={0} cellSpacing={0}>
          <tbody>
            <Row label="Nom" value={name} />
            <Row label="Téléphone" value={phone} />
            <Row label="Courriel" value={email} />
            <Row label="Adresse" value={address} />
            <Row label="Code postal" value={postalCode} />
            <Row label="Matériel demandé" value={materials} />
            <Row label="Nombre de voyages" value={quantity} />
            <Row label="Budget" value={budget} />
            <Row label="Date limite de réception" value={deliveryDeadline} />
            <Row label="Notes" value={notes} />
            <Row label="Numéro DOMPE" value={dompeNumber} />
            <Row label="Date de soumission" value={submittedAt} />
          </tbody>
        </table>
        {crmLink && (
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={crmLink} style={button}>
              👉 Voir ce lead dans le CRM
            </Button>
          </Section>
        )}
        <Hr style={hr} />
        <Text style={footer}>Notification interne — Vrac Québec</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NewLeadEmail,
  subject: (d: Record<string, any>) =>
    `🚛 Nouveau lead Vrac Québec Simple${d?.name ? ` — ${d.name}` : ''}`,
  displayName: 'Notification de nouveau lead',
  previewData: {
    name: 'Jean Tremblay',
    phone: '418-000-0000',
    email: 'jean@example.com',
    address: '123 rue Exemple, Québec',
    postalCode: 'G1A 1A1',
    materials: 'Terre',
    quantity: 5,
    budget: '500 $ / voyage',
    notes: 'Livraison rapide souhaitée',
    dompeNumber: '12',
    submissionNumber: '101',
    submittedAt: '6 mai 2026, 14:32',
    crmLink: 'https://vracquebec.ca/admin?lead=example',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '640px', margin: '0 auto' }
const header = { background: '#f97316', color: '#ffffff', padding: '20px', borderRadius: '12px 12px 0 0' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#ffffff', margin: '0' }
const subheader = { fontSize: '13px', color: '#ffffff', margin: '6px 0 0', opacity: 0.95 }
const table = { borderCollapse: 'collapse', width: '100%', fontSize: '14px', border: '1px solid #f3d9b8', borderTop: 'none' }
const th = { padding: '8px 12px', border: '1px solid #f3d9b8', fontWeight: 600, background: '#fff7ed', color: '#7c2d12', width: '42%' }
const td = { padding: '8px 12px', border: '1px solid #f3d9b8', color: '#1f2937' }
const button = { background: '#f97316', color: '#ffffff', padding: '14px 28px', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold', fontSize: '15px' }
const hr = { borderColor: '#f3d9b8', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const }