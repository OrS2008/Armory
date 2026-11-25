import { generateToken, hexToBytes, TokenType } from './token';

const DEFAULT_BASE = 'https://api1.pal-es.com/v1/bt/';
let BASE = DEFAULT_BASE;

/** Local development only (PALGATE_BASE in .dev.vars) points at a PalGate stand-in. */
export function configurePalgate(base: string | undefined) {
  BASE = base && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/([A-Za-z0-9_-]+\/)*$/.test(base) ? base : DEFAULT_BASE;
}
const UA = 'okhttp/4.9.3';

export interface Session {
  phone: number;
  token: string; // 32 hex chars
  type: TokenType;
  linkedAt: string;
}

export interface PalDevice {
  id: string;
  name: string;
  outputs: number[];
  raw: Record<string, unknown>;
}

export class PalGateError extends Error {
  constructor(
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

async function call(path: string, init: RequestInit & { session?: Session } = {}) {
  const headers = new Headers(init.headers);
  headers.set('User-Agent', UA);
  if (init.session) {
    const { phone, token, type } = init.session;
    headers.set('X-Bt-Token', generateToken(hexToBytes(token), phone, type));
  }
  const res = await fetch(BASE + path, { ...init, headers });
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new PalGateError(`PalGate returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || body.err || body.status !== 'ok') {
    const msg = typeof body.msg === 'string' ? body.msg : `HTTP ${res.status}`;
    throw new PalGateError(`PalGate: ${msg}`, body);
  }
  return body;
}

/**
 * Waits (long-poll on PalGate's side) until the QR code `{"id":"<uniqueId>"}`
 * is scanned in the PalGate app → ☰ → Linked Devices → Link a Device.
 */
export async function waitForLink(uniqueId: string, signal?: AbortSignal): Promise<Session> {
  const body = await call(`un/secondary/init/${encodeURIComponent(uniqueId)}`, { signal });
  const user = body.user as { id?: string | number; token?: string } | undefined;
  const phone = Number(user?.id);
  const token = String(user?.token ?? '');
  const type = Number(body.secondary) as TokenType;
  if (!Number.isSafeInteger(phone) || !/^[0-9a-fA-F]{32}$/.test(token) || !(type in TokenType)) {
    throw new PalGateError('Unexpected linking response', body);
  }
  return { phone, token: token.toLowerCase(), type, linkedAt: new Date().toISOString() };
}

export async function checkToken(session: Session) {
  const ts = Math.floor(Date.now() / 1000);
  await call(`user/check-token?ts=${ts}&ts_diff=0`, { session });
}

export async function listDevices(session: Session): Promise<PalDevice[]> {
  const body = await call('devices', { session });
  const devices = Array.isArray(body.devices) ? (body.devices as Record<string, unknown>[]) : [];
  return devices.map((d) => {
    const id = String(d.id ?? d._id ?? '');
    const name = [d.name1, d.name, d.displayName, d.address].find(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    // Gates with two relays expose a second output; default to 1.
    const outputs = [1];
    if (d.output2 || d.outputs === 2 || d.name2) outputs.push(2);
    return { id, name: name ?? id, outputs, raw: d };
  });
}

export async function openGate(session: Session, deviceId: string, output = 1) {
  const q = `openBy=100&outputNum=${encodeURIComponent(String(output))}`;
  return call(`device/${encodeURIComponent(deviceId)}/open-gate?${q}`, { session });
}
