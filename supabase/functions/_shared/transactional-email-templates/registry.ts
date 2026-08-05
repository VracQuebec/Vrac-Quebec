/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as newLeadNotification } from './new-lead-notification.tsx'
import { template as clientConfirmation } from './client-confirmation.tsx'
import { template as directionDailyReport } from './direction-daily-report.tsx'
import { template as soumissionClient } from './soumission-client.tsx'
import { template as soumissionInterne } from './soumission-interne.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'new-lead-notification': newLeadNotification,
  'client-confirmation': clientConfirmation,
  'direction-daily-report': directionDailyReport,
  'soumission-client': soumissionClient,
  'soumission-interne': soumissionInterne,
}