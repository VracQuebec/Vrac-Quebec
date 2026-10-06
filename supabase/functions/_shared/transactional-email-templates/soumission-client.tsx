import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface QuoteProps {
  quoteNumber?: string
  name?: string
  material?: string
  quantity?: string
  trips?: string | number
  truck?: string
  address?: string
  total?: string
  validUntil?: string
}

const Line = ({ label, value }: { label: string; value?: string | number }) => (
  <tr>
    <td style={th}>{label}</td>
    <td style={td}>{value !== undefined && value !== null && value !== '' ? String(value) : '—'}</td>
  </tr>
)

const QuoteEmail = ({
  quoteNumber, name, material, quantity, trips, truck, address, total, validUntil,
}: QuoteProps) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Votre soumission Vrac Québec {quoteNumber ?? ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>Vrac Québec</Heading>
          <Text style={subheader}>Soumission instantanée {quoteNumber ? `n° ${quoteNumber}` : ''}</Text>
        </Section>
        <Section style={content}>
          <Text style={text}>Bonjour{name ? ` ${name}` : ''},</Text>
          <Text style={text}>Voici l'estimation de votre livraison de matériaux en vrac.</Text>

          <table style={table as any} cellPadding={0} cellSpacing={0}>
            <tbody>
              <Line label="Matériau" value={material} />
              <Line label="Quantité" value={quantity} />
              <Line label="Transport" value={trips ? `${trips} voyage${Number(trips) > 1 ? 's' : ''}` : undefined} />
              <Line label="Camion" value={truck} />
              <Line label="Adresse" value={address} />
            </tbody>
          </table>

          <Section style={totalBox}>
            <Text style={totalLabel}>Estimation</Text>
            <Text style={totalValue}>{total ?? '—'}</Text>
            <Text style={totalHint}>TPS et TVQ incluses</Text>
          </Section>

          <Text style={text}>
            Cette estimation est valide {validUntil ? `jusqu'au ${validUntil}` : 'pendant 7 jours'}.
            Notre équipe communiquera avec vous rapidement afin de confirmer la disponibilité
            et planifier votre livraison.
          </Text>

          <Section style={noticeBox}>
            <Text style={noticeTitle}>Information importante</Text>
            <Text style={noticeText}>
              Cette soumission est une estimation automatique basée sur les informations fournies.
              Si des modifications sont apportées à la commande (quantité, adresse, matériau,
              conditions d'accès ou tout autre élément pouvant influencer la livraison), le prix
              pourrait être ajusté. Notre équipe confirmera toujours le montant final avant la livraison.
            </Text>
            <Text style={noticeText}>Aucune facturation avant la confirmation de votre commande.</Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Une question ? 819-592-3495<br />
            Vrac Québec — vracquebec.ca
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: QuoteEmail,
  subject: (data: Record<string, any>) =>
    `Votre soumission Vrac Québec${data?.quoteNumber ? ` ${data.quoteNumber}` : ''}`,
  displayName: 'Soumission client',
  previewData: {
    quoteNumber: 'SOU-000123', name: 'Jean Tremblay', material: 'Pierre 0-3/4',
    quantity: '30 tonnes', trips: 2, truck: '12 roues (18 tonnes)', address: '123 rue Principale, Québec',
    total: '1 248,50 $', validUntil: '12 août 2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '0', maxWidth: '600px', margin: '0 auto' }
const header = { backgroundColor: '#111111', color: '#ffffff', padding: '24px', borderRadius: '12px 12px 0 0', textAlign: 'center' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#7ED321', margin: '0' }
const subheader = { fontSize: '14px', color: '#ffffff', margin: '6px 0 0' }
const content = { padding: '28px 24px', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const text = { fontSize: '15px', color: '#1f2937', lineHeight: '1.6', margin: '0 0 16px' }
const table = { width: '100%', borderCollapse: 'collapse' as const, margin: '0 0 20px' }
const th = { padding: '10px 12px', fontSize: '13px', color: '#6b7280', backgroundColor: '#f9fafb', width: '38%', borderBottom: '1px solid #e5e7eb' }
const td = { padding: '10px 12px', fontSize: '14px', color: '#111111', fontWeight: 'bold' as const, borderBottom: '1px solid #e5e7eb' }
const totalBox = { backgroundColor: '#f4fbe9', border: '1px solid #7ED321', borderRadius: '12px', padding: '18px', textAlign: 'center' as const, margin: '0 0 20px' }
const totalLabel = { fontSize: '13px', color: '#4b5563', margin: '0', textTransform: 'uppercase' as const }
const totalValue = { fontSize: '30px', fontWeight: 'bold' as const, color: '#111111', margin: '6px 0 0' }
const totalHint = { fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const noticeBox = { backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', margin: '0 0 16px' }
const noticeTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: '#111111', margin: '0 0 6px' }
const noticeText = { fontSize: '13px', color: '#4b5563', lineHeight: '1.6', margin: '0 0 8px' }
const footer = { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
