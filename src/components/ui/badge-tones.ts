import type { Severity } from '@shared/types';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const toneClasses: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-ink-muted',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand-50 text-brand-700',
};

/** Conflict severity maps to a fixed tone everywhere in the product. */
export const severityTone: Record<Severity, Tone> = {
  blocking: 'danger',
  warning: 'warning',
  info: 'info',
};
