import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  confirmUrl?: string
}

const EntrepreneurConfirmationEmail = ({ name, confirmUrl }: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Confirmez votre courriel pour activer votre espace entrepreneur</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>Vrac Québec</Heading>
          <Text style={subheader}>Confirmation de votre courriel</Text>
        </Section>
        <Section style={content}>
          <Text style={text}>Bonjour{name ? ` ${name}` : ''},</Text>
          <Text style={text}>
            Une inscription à l'espace entrepreneur Vrac Québec a été demandée avec cette adresse.
            Cliquez sur le bouton pour confirmer qu'elle vous appartient et activer votre compte.
          </Text>
          {confirmUrl ? (
            <Section style={{ textAlign: 'center' as const, margin: '8px 0 20px' }}>
              <Button href={confirmUrl} style={button}>Confirmer mon courriel</Button>
            </Section>
          ) : null}
          <Text style={small}>
            Si vous n'avez pas demandé cette inscription, ignorez ce message : aucun compte ne sera activé.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Vrac Québec — vracquebec.ca — 819-592-3495</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: EntrepreneurConfirmationEmail,
  subject: 'Confirmez votre courriel — Vrac Québec',
  displayName: 'Confirmation inscription entrepreneur',
  previewData: { name: 'Jean Tremblay', confirmUrl: 'https://vracquebec.ca/login' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '0', maxWidth: '600px', margin: '0 auto' }
const header = { backgroundColor: '#111111', padding: '24px', borderRadius: '12px 12px 0 0', textAlign: 'center' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#7DD520', margin: '0' }
const subheader = { fontSize: '14px', color: '#ffffff', margin: '6px 0 0' }
const content = { padding: '28px 24px', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const text = { fontSize: '15px', color: '#1f2937', lineHeight: '1.6', margin: '0 0 16px' }
const small = { fontSize: '13px', color: '#4b5563', lineHeight: '1.5', margin: '0 0 8px' }
const button = { backgroundColor: '#7DD520', color: '#111111', padding: '12px 22px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
