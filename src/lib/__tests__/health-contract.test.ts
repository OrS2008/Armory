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
