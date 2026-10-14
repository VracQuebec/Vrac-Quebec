import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  requestNumber?: string; name?: string; company?: string; phone?: string; email?: string
  city?: string; material?: string; quantity?: string; dump?: string; desiredDate?: string
  submittedAt?: string; link?: string
}

const Line = ({ label, value }: { label: string; value?: string }) => (
  <tr><td style={th}>{label}</td><td style={td}>{value ? value : '—'}</td></tr>
)

const Email = (p: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Nouvelle demande de dompe {p.requestNumber ?? ''} — action requise</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>Nouvelle demande de dompe</Heading>
          <Text style={sub}>{p.requestNumber ?? ''} · Action requise</Text>
        </Section>
        <table style={table as any} cellPadding={0} cellSpacing={0}><tbody>
          <Line label="Entrepreneur" value={[p.name, p.company].filter(Boolean).join(' — ')} />
          <Line label="Téléphone" value={p.phone} />
          <Line label="Courriel" value={p.email} />
          <Line label="Ville / secteur" value={p.city} />
          <Line label="Matériau" value={p.material} />
          <Line label="Quantité" value={p.quantity} />
          <Line label="Dompe demandée" value={p.dump} />
          <Line label="Date souhaitée" value={p.desiredDate} />
          <Line label="Soumise le" value={p.submittedAt} />
        </tbody></table>
        <Section style={{ textAlign: 'center' as const, padding: '8px 0 20px' }}>
          <Button href={p.link ?? 'https://vracquebec.ca/admin/demandes-acces'} style={button}>Ouvrir la demande</Button>
        </Section>
        <Text style={footer}>Vrac Québec — cette demande reste affichée sur l’accueil admin jusqu’à sa prise en charge.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `NOUVELLE DEMANDE DE DOMPE — ACTION REQUISE${d?.requestNumber ? ` (${d.requestNumber})` : ''}`,
  displayName: 'Nouvelle demande de dompe — admin',
  previewData: { requestNumber: 'DT-0055', name: 'Jean Tremblay', city: 'Lévis', material: 'Remblai', link: 'https://vracquebec.ca/admin/demandes-acces' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { maxWidth: '600px', margin: '0 auto' }
const header = { backgroundColor: '#111111', padding: '20px', borderRadius: '12px 12px 0 0', textAlign: 'center' as const }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#7DD520', margin: '0' }
const sub = { fontSize: '13px', color: '#ffffff', margin: '6px 0 0' }
const table = { width: '100%', borderCollapse: 'collapse' as const, margin: '0 0 16px' }
const th = { padding: '10px 12px', fontSize: '13px', color: '#6b7280', backgroundColor: '#f9fafb', width: '38%', borderBottom: '1px solid #e5e7eb' }
const td = { padding: '10px 12px', fontSize: '14px', color: '#111111', fontWeight: 'bold' as const, borderBottom: '1px solid #e5e7eb' }
const button = { backgroundColor: '#7DD520', color: '#111111', padding: '12px 22px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, margin: '0 0 16px' }
