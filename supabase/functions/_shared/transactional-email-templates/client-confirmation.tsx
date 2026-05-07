import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface ClientConfirmationProps {
  name?: string
}

const ClientConfirmationEmail = ({ name }: ClientConfirmationProps) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Nous avons bien reçu votre demande — Vrac Québec</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>✅ Demande bien reçue</Heading>
        </Section>
        <Section style={body}>
          <Text style={text}>Bonjour{name ? ` ${name}` : ''},</Text>
          <Text style={text}>
            Nous avons bien reçu votre demande de matériel en vrac. Un membre
            de notre équipe communiquera avec vous afin de discuter de votre
            projet.
          </Text>
          <Text style={text}>
            Par la suite, un entrepreneur vous contactera dès que le matériel
            demandé sera disponible dans votre secteur afin d'effectuer la
            livraison.
          </Text>
          <Text style={text}>Merci d'avoir choisi Vrac Québec.</Text>
          <Hr style={hr} />
          <Text style={footer}>L'équipe Vrac Québec — vracquebec.ca</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ClientConfirmationEmail,
  subject: 'Confirmation de votre demande — Vrac Québec',
  displayName: 'Confirmation client',
  previewData: { name: 'Jean Tremblay' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '0', maxWidth: '600px', margin: '0 auto' }
const header = { background: '#f97316', color: '#ffffff', padding: '24px', borderRadius: '12px 12px 0 0', textAlign: 'center' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#ffffff', margin: 0 }
const body = { padding: '24px', border: '1px solid #f3d9b8', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const text = { fontSize: '15px', color: '#1f2937', lineHeight: '1.6', margin: '0 0 14px' }
const hr = { borderColor: '#f3d9b8', margin: '20px 0' }
const footer = { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, margin: 0 }