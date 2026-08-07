import { body, fail, id, json, now, requireUser, type Env } from '../../_shared/http';

const catalog = new Set(['helmet', 'vest', 'mitznefet', 'knee', 'mags']);
const departments: Record<string, string> = {
  'מחלקה 1': 'p1', 'מחלקה 2': 'p2', 'מחלקה 3': 'p3', 'מפל״ג': 'mplag', 'מסופחים': 'attached',
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const input = await body(request);
  if (input instanceof Response) return input;
  const fullName = String(input.fullName ?? '').trim();
  const personalId = String(input.personalId ?? '').replace(/\D/g, '');
  const phone = String(input.phone ?? '').replace(/\D/g, '');
  const department = String(input.department ?? '').trim();
  const rawLines = Array.isArray(input.items) ? input.items : [];
  const lines = rawLines
    .map((raw) => raw && typeof raw === 'object' ? raw as Record<string, unknown> : {})
    .map((raw) => ({ itemId: String(raw.itemId ?? ''), quantity: Number(raw.quantity) }))
    .filter((line) => catalog.has(line.itemId) && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 20);
  if (fullName.length < 2 || personalId.length < 5 || phone.length !== 10 || !departments[department] || !lines.length)
    return fail(422, 'VALIDATION_ERROR', 'יש למלא פרטים תקינים ולבחור לפחות פריט ציוד אחד');
  if (lines.length !== rawLines.length || new Set(lines.map((line) => line.itemId)).size !== lines.length)
    return fail(422, 'INVALID_ITEMS', 'רשימת הציוד אינה תקינה');

  const timestamp = now();
  const soldierId = id();
  const signatureId = id();
  const existing = await env.DB.prepare('SELECT id FROM soldiers WHERE personal_id=?').bind(personalId).first<{ id: string }>();
  const resolvedSoldierId = existing?.id ?? soldierId;
  const signatureKey = String(input.signatureObjectKey ?? '');
  const licenses = Array.isArray(input.licenses) ? input.licenses : [];
  if (!/^pending\/signature\/[0-9a-f-]+$/.test(signatureKey))
    return fail(422, 'SIGNATURE_REQUIRED', 'נדרשת חתימה ידנית');
  for (const raw of licenses) {
    const license = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    if (!['civilian', 'military'].includes(String(license.type)) || String(license.number ?? '').trim().length < 3 || !Number.isFinite(Number(license.expiresAt)) || !new RegExp(`^pending/${String(license.type)}_license/[0-9a-f-]+$`).test(String(license.documentObjectKey ?? '')))
      return fail(422, 'INVALID_LICENSE', 'יש למלא מספר, תוקף וצילום לכל רישיון שנבחר');
  }
  const statements = [
    existing
      ? env.DB.prepare('UPDATE soldiers SET full_name=?,phone=?,department_id=?,updated_at=?,version=version+1 WHERE id=?')
          .bind(fullName, phone, departments[department], timestamp, resolvedSoldierId)
      : env.DB.prepare('INSERT INTO soldiers(id,personal_id,full_name,phone,department_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
          .bind(resolvedSoldierId, personalId, fullName, phone, departments[department], timestamp, timestamp),
    env.DB.prepare(`INSERT INTO equipment_signatures(id,soldier_id,weapon_serial,amral_serial,scope_serial,soldier_note,consent_text,signed_at,created_at,updated_at,signature_object_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(signatureId, resolvedSoldierId, String(input.weaponSerial ?? '').trim() || null, String(input.amralSerial ?? '').trim() || null, String(input.scopeSerial ?? '').trim() || null, String(input.note ?? '').trim() || null, 'אני מאשר שקיבלתי את הציוד המפורט ומתחייב להחזירו', timestamp, timestamp, timestamp, signatureKey),
    ...lines.map((line) => env.DB.prepare('INSERT INTO equipment_signature_lines(id,signature_id,equipment_item_id,issued_quantity,updated_at) VALUES(?,?,?,?,?)')
      .bind(id(), signatureId, line.itemId, line.quantity, timestamp)),
    ...licenses.map((raw) => {
      const license = raw as Record<string, unknown>;
      return env.DB.prepare(`INSERT INTO licenses(id,soldier_id,type,license_number,expires_at,status,created_at,updated_at,document_object_key,document_name,document_type,document_size) VALUES(?,?,?,?,?,'pending',?,?,?,?,?,?) ON CONFLICT(soldier_id,type) DO UPDATE SET license_number=excluded.license_number,expires_at=excluded.expires_at,status='pending',updated_at=excluded.updated_at,document_object_key=excluded.document_object_key,document_name=excluded.document_name,document_type=excluded.document_type,document_size=excluded.document_size`)
        .bind(id(), resolvedSoldierId, String(license.type), String(license.number).trim(), Number(license.expiresAt), timestamp, timestamp, String(license.documentObjectKey), String(license.documentName ?? ''), String(license.documentType ?? ''), Number(license.documentSize ?? 0));
    }),
  ];
  await env.DB.batch(statements);
  return json({ ok: true, id: signatureId, status: 'pending' }, 201);
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, 'equipment');
  if (user instanceof Response) return user;
  const rows = await env.DB.prepare(`SELECT es.id,es.status,es.weapon_serial,es.amral_serial,es.scope_serial,es.soldier_note,es.signature_object_key,es.signed_at,es.approved_at,s.id soldier_id,s.personal_id,s.full_name,s.phone,d.name department FROM equipment_signatures es JOIN soldiers s ON s.id=es.soldier_id LEFT JOIN departments d ON d.id=s.department_id ORDER BY es.created_at DESC LIMIT 300`).all();
  const lineRows = await env.DB.prepare(`SELECT l.id,l.signature_id,l.equipment_item_id,i.name,l.issued_quantity,l.returned_quantity FROM equipment_signature_lines l JOIN equipment_items i ON i.id=l.equipment_item_id WHERE l.signature_id IN (SELECT id FROM equipment_signatures ORDER BY created_at DESC LIMIT 300) ORDER BY i.name`).all();
  const grouped = new Map<string, unknown[]>();
  for (const line of lineRows.results as Array<Record<string, unknown>>) {
    const key = String(line.signature_id);
    grouped.set(key, [...(grouped.get(key) ?? []), line]);
  }
  const licenseRows = await env.DB.prepare(`SELECT soldier_id,type,license_number,expires_at,status,document_object_key,document_name FROM licenses WHERE soldier_id IN (SELECT soldier_id FROM equipment_signatures ORDER BY created_at DESC LIMIT 300)`).all();
  const licenseGrouped = new Map<string, unknown[]>();
  for (const license of licenseRows.results as Array<Record<string, unknown>>) {
    const key = String(license.soldier_id);
    licenseGrouped.set(key, [...(licenseGrouped.get(key) ?? []), license]);
  }
  return json({ ok: true, items: (rows.results as Array<Record<string, unknown>>).map((row) => ({ ...row, lines: grouped.get(String(row.id)) ?? [], licenses: licenseGrouped.get(String(row.soldier_id)) ?? [] })) });
};
