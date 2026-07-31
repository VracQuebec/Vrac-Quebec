/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  companyName?: string
  reportDate?: string
  summary?: string
  revenue?: number
  orders?: number
  newClients?: number
  lateDeliveries?: number
}

const cad = (n?: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(Number(n ?? 0))

const Email = ({ companyName, reportDate, summary, revenue, orders, newClients, lateDeliveries }: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>{`Rapport de direction ${reportDate ?? ''} — ${companyName ?? 'Vrac Québec'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Rapport quotidien de direction</Heading>
        <Text style={muted}>{`${companyName ?? 'Vrac Québec'} · ${reportDate ?? ''}`}</Text>

        <Section style={kpis}>
          <Text style={kpi}>{`Chiffre d'affaires (24 h) : ${cad(revenue)}`}</Text>
          <Text style={kpi}>{`Commandes : ${orders ?? 0}`}</Text>
          <Text style={kpi}>{`Nouveaux clients : ${newClients ?? 0}`}</Text>
          <Text style={kpi}>{`Livraisons en retard : ${lateDeliveries ?? 0}`}</Text>
        </Section>

        <Hr style={hr} />
        {(summary ?? '').split('\n').filter(Boolean).map((line, i) => (
          <Text key={i} style={body}>{line.replace(/[*#]/g, '')}</Text>
        ))}
        <Hr style={hr} />
        <Text style={muted}>Rapport généré automatiquement par Vrac Québec OS à partir des données réelles de la plateforme.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Rapport de direction — ${d?.reportDate ?? ''}`,
  displayName: 'Rapport quotidien de direction',
  previewData: { companyName: 'Vrac Québec', reportDate: '2026-07-31', summary: 'Résumé du jour.', revenue: 12500, orders: 4, newClients: 1, lateDeliveries: 0 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const h1 = { fontSize: '20px', color: '#111111', margin: '0 0 4px' }
const muted = { fontSize: '12px', color: '#6b7280', margin: '0 0 12px' }
const kpis = { backgroundColor: '#f4fbe9', borderLeft: '4px solid #7ED321', padding: '12px 16px', borderRadius: '6px' }
const kpi = { fontSize: '14px', color: '#111111', margin: '2px 0' }
const hr = { borderColor: '#e5e7eb', margin: '18px 0' }
const body = { fontSize: '14px', color: '#111111', lineHeight: '22px', margin: '6px 0' }