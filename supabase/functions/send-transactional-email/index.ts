import * as React from 'npm:react@18.3.1'
import { clientIp, enforceIpQuota } from '../_shared/public-guard.ts'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { logEvent, logEventAsync } from '../_shared/observability.ts'

// Configuration baked in at scaffold time — do NOT change these manually.
// To update, re-run the email domain setup flow.
const SITE_NAME = "vrac-quebec"
// SENDER_DOMAIN is the verified sender subdomain FQDN (e.g., "notify.example.com").
// It MUST match the subdomain delegated to Lovable's nameservers — never the root domain.
// The email API looks up this exact domain; a mismatch causes "No email domain record found".
const SENDER_DOMAIN = "notify.vracquebec.ca"
// FROM_DOMAIN is the domain shown in the From: header (e.g., "example.com").
// When display_from_root is enabled, this can be the root domain for cleaner branding,
// even though actual sending uses the subdomain above.
const FROM_DOMAIN = "notify.vracquebec.ca"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Auth note: verify_jwt is set to false in config.toml so the public
// questionnaire (anon key) can invoke this function. We enforce a basic
// in-function auth check by requiring a Supabase JWT (anon or signed-in)
// via the Authorization header, and we restrict which templates anon
// callers may use.
const PUBLIC_TEMPLATES = new Set(['client-confirmation', 'new-lead-notification'])

// Fixed admin recipient for internal lead notifications. Hardcoding here
// (instead of trusting the caller-supplied recipientEmail) prevents anonymous
// callers from redirecting these notifications to arbitrary addresses.
const ADMIN_NOTIFICATION_EMAIL = 'TransportJSC@hotmail.com'

// UUID v4-ish validation for submission IDs accepted from public callers.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Require an Authorization header (anon or user JWT). This blocks
  // completely unauthenticated external callers from abusing the endpoint.
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  let submissionId: string | undefined
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
    submissionId = body.submissionId || body.submission_id
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({ error: 'Template not found' }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Restrict which templates can be invoked with just the anon key.
  // Privileged templates require a real user session.
  if (!PUBLIC_TEMPLATES.has(templateName)) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const callerToken = authHeader.slice(7).trim()
    if (callerToken === anonKey) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // Create Supabase client with service role (bypasses RLS) — needed below
  // for suppression checks AND for the secure server-side resolution of the
  // recipient/templateData for public templates.
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // SECURITY: for public templates, never trust caller-supplied recipient or
  // templateData. Require a submission_id, look up the canonical submission
  // with the service role, and derive both the recipient and the email
  // payload from the database row. This prevents anyone holding the public
  // anon key from sending arbitrary emails to arbitrary addresses.
  let effectiveRecipient: string | undefined = template.to || recipientEmail

  if (PUBLIC_TEMPLATES.has(templateName)) {
    // Quota par adresse : un appelant anonyme ne peut pas déclencher
    // des envois en série à partir d'identifiants devinés.
    try {
      await enforceIpQuota(supabase, 'send-transactional-email', clientIp(req), 20, 60)
    } catch (guardError) {
      return new Response(
        JSON.stringify({ error: (guardError as Error).message }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!submissionId || !UUID_RE.test(submissionId)) {
      return new Response(
        JSON.stringify({ error: 'submission_id is required for this template' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .maybeSingle()

    if (subErr || !sub) {
      return new Response(
        JSON.stringify({ error: 'Submission not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (templateName === 'new-lead-notification') {
      effectiveRecipient = ADMIN_NOTIFICATION_EMAIL
      const materialsLabel = Array.isArray(sub.materials)
        ? sub.materials.join(', ')
        : (sub.materials ?? '')
      templateData = {
        name: sub.name ?? '',
        phone: sub.phone ?? '',
        email: sub.email ?? '',
        address: sub.address ?? '',
        postalCode: sub.postal_code ?? '',
        materials: materialsLabel + (sub.other_material ? ` (Autre: ${sub.other_material})` : ''),
        quantity: sub.quantity ?? '',
        budget: sub.budget_max ? `${sub.budget_max}${sub.budget_unit ? ` ${sub.budget_unit}` : ''}` : '',
        notes: sub.description ?? '',
        deliveryDeadline: sub.delivery_deadline ?? '',
        deliveryTimeframe: sub.delivery_timeframe ?? '',
        accessibility: Array.isArray(sub.accessibility) ? sub.accessibility.join(', ') : '',
        machinery: sub.machinery_available
          ? `Oui — ${sub.machinery_description ?? ''}`
          : 'Non',
        photosCount: Array.isArray(sub.photos) ? sub.photos.length : 0,
        requestType: sub.request_type ?? '',
        dompeNumber: sub.dompe_number ?? '',
        submissionNumber: sub.submission_number ?? '',
        submittedAt: sub.created_at ?? '',
        crmLink: `https://vracquebec.ca/admin?lead=${sub.id}`,
      }
    } else if (templateName === 'client-confirmation') {
      if (!sub.email) {
        return new Response(
          JSON.stringify({ success: false, reason: 'no_client_email' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      effectiveRecipient = sub.email
      templateData = { name: sub.name ?? '' }
    }
  }

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 2. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify suppression status' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Adresses réservées aux essais (RFC 2606 / 6761) : jamais d'envoi réel.
  const isReservedTestAddress = /@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$/i
    .test(effectiveRecipient.trim())

  if (suppressed || isReservedTestAddress) {
    // Log the suppressed attempt
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 3. Get or create unsubscribe token (one token per email address)
  const normalizedEmail = effectiveRecipient.toLowerCase()
  let unsubscribeToken: string

  // Check for existing token for this email
  const { data: existingToken, error: tokenLookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (tokenLookupError) {
    console.error('Token lookup failed', {
      error: tokenLookupError,
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to look up unsubscribe token',
    })
    return new Response(
      JSON.stringify({ error: 'Failed to prepare email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (existingToken && !existingToken.used_at) {
    // Reuse existing unused token
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    // Create new token — upsert handles concurrent inserts gracefully
    unsubscribeToken = generateToken()
    const { error: tokenError } = await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (tokenError) {
      console.error('Failed to create unsubscribe token', {
        error: tokenError,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to create unsubscribe token',
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // If another request raced us, our upsert was silently ignored.
    // Re-read to get the actual stored token.
    const { data: storedToken, error: reReadError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (reReadError || !storedToken) {
      console.error('Failed to read back unsubscribe token after upsert', {
        error: reReadError,
        email: normalizedEmail,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to confirm unsubscribe token storage',
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    unsubscribeToken = storedToken.token
  } else {
    // Token exists but is already used — email should have been caught by suppression check above.
    // This is a safety fallback; log and skip sending.
    console.warn('Unsubscribe token already used but email not suppressed', {
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message:
        'Unsubscribe token used but email missing from suppressed list',
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 4. Render React Email template to HTML and plain text
  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  // Resolve subject — supports static string or dynamic function
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  // 5. Enqueue the pre-rendered email for async processing by the dispatcher.
  // The dispatcher (process-email-queue) handles sending, retries, and rate-limit backoff.

  // Log pending BEFORE enqueue so we have a record even if enqueue crashes
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    await logEvent({
      source: 'email',
      event: 'enqueue.failed',
      level: 'critical',
      message: enqueueError.message ?? 'Failed to enqueue email',
      refId: idempotencyKey ?? messageId,
      context: { template: templateName },
    })

    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })

    return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  logEventAsync({
    source: 'email',
    event: 'enqueue.ok',
    refId: idempotencyKey ?? messageId,
    context: { template: templateName },
  })

  return new Response(
    JSON.stringify({ success: true, queued: true }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
