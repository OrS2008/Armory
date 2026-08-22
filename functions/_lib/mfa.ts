/** Shared pieces of the second factor: challenges and recovery codes. */
import { newId, now, randomHex, sha256, timingSafeEqual, type Env } from './http';

/** Long enough that a stolen challenge is useless, short enough to be typed. */
const CHALLENGE_TTL_MS = 5 * 60_000;
const RECOVERY_CODE_COUNT = 10;

export async function createChallenge(env: Env, userId: string): Promise<string> {
  const raw = randomHex(24);
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mfa_challenges (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(newId('mfc'), userId, await sha256(raw), timestamp + CHALLENGE_TTL_MS, timestamp),
    env.DB.prepare('DELETE FROM mfa_challenges WHERE expires_at < ?').bind(timestamp),
  ]);
  return raw;
}

/**
 * Reads a challenge without spending it. A mistyped code should not send the
 * reader back to the password form; the guard against guessing the six digits
 * is the same login throttle the password has, not a one-shot challenge.
 */
export async function readChallenge(
  env: Env,
  raw: string,
): Promise<{ id: string; userId: string } | null> {
  const row = await env.DB.prepare(
    'SELECT id, user_id, expires_at FROM mfa_challenges WHERE token_hash = ?',
  )
    .bind(await sha256(raw))
    .first<{ id: string; user_id: string; expires_at: number }>();
  if (!row || row.expires_at <= now()) return null;
  return { id: row.id, userId: row.user_id };
}

export async function consumeChallenge(env: Env, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM mfa_challenges WHERE id = ?').bind(id).run();
}

/** Readable, unambiguous, and never reused: 10 codes of 10 characters. */
export function generateRecoveryCodes(): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let index = 0; index < RECOVERY_CODE_COUNT; index += 1) {
    const raw = new Uint8Array(10);
    crypto.getRandomValues(raw);
    const body = Array.from(raw, (byte) => alphabet[byte % alphabet.length]).join('');
    codes.push(`${body.slice(0, 5)}-${body.slice(5)}`);
  }
  return codes;
}

export const normaliseRecoveryCode = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();

export async function replaceRecoveryCodes(
  env: Env,
  userId: string,
  codes: string[],
): Promise<void> {
  const timestamp = now();
  const statements = [
    env.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').bind(userId),
    ...(await Promise.all(
      codes.map(async (code) =>
        env.DB.prepare(
          `INSERT INTO mfa_recovery_codes (id, user_id, code_hash, used_at, created_at)
           VALUES (?, ?, ?, NULL, ?)`,
        ).bind(newId('rec'), userId, await sha256(normaliseRecoveryCode(code)), timestamp),
      ),
    )),
  ];
  await env.DB.batch(statements);
}

/** Spends one recovery code, if it matches an unused one. */
export async function useRecoveryCode(env: Env, userId: string, code: string): Promise<boolean> {
  const hash = await sha256(normaliseRecoveryCode(code));
  const rows = await env.DB.prepare(
    'SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL',
  )
    .bind(userId)
    .all<{ id: string; code_hash: string }>();

  // Compared one by one rather than in SQL, so the comparison is constant-time
  // and a wrong code cannot be distinguished by how long the query took.
  const match = (rows.results ?? []).find((row) => timingSafeEqual(row.code_hash, hash));
  if (!match) return false;
  await env.DB.prepare('UPDATE mfa_recovery_codes SET used_at = ? WHERE id = ?')
    .bind(now(), match.id)
    .run();
  return true;
}

export async function clearMfa(env: Env, userId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?').bind(userId),
    env.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM mfa_challenges WHERE user_id = ?').bind(userId),
  ]);
}
