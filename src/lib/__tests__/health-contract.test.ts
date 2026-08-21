import { describe, expect, it } from 'vitest';
import { ErrorCodes } from '@shared/errors';
import { errorMessage } from '@shared/messages.he';

describe('operator-facing diagnostics', () => {
  it('names an un-migrated database distinctly from an unconfigured one', () => {
    expect(ErrorCodes.SCHEMA_NOT_READY).toBe('SCHEMA_NOT_READY');
    expect(errorMessage(ErrorCodes.SCHEMA_NOT_READY)).not.toBe(
      errorMessage(ErrorCodes.NOT_CONFIGURED),
    );
  });

  it('tells the reader what to actually do about it', () => {
    expect(errorMessage(ErrorCodes.SCHEMA_NOT_READY)).toContain('מיגרציות');
    expect(errorMessage(ErrorCodes.NOT_CONFIGURED)).toContain('מנהל המערכת');
  });
});

describe('transport failures', () => {
  it('distinguishes no connection from a server that answered', async () => {
    const { transportErrorMessage } = await import('@shared/messages.he');
    expect(transportErrorMessage(0)).toContain('אין תקשורת');
    expect(transportErrorMessage(500)).toContain('500');
  });

  it('carries the status code so an operator can act on it', async () => {
    const { transportErrorMessage } = await import('@shared/messages.he');
    expect(transportErrorMessage(502)).toContain('502');
    expect(transportErrorMessage(502)).not.toBe(transportErrorMessage(500));
  });
});
