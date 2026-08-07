import { body, fail, id, json, now, requireUser, type Env } from '../../../_shared/http';

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await requireUser(request, env, 'equipment');
  if (user instanceof Response) return user;
  const input = await body(request);
  if (input instanceof Response) return input;
  const signatureId = String(params.id ?? '');
  const action = String(input.action ?? '');
  const timestamp = now();
  const signature = await env.DB.prepare('SELECT id,soldier_id,status FROM equipment_signatures WHERE id=?').bind(signatureId).first<{ id: string; soldier_id: string; status: string }>();
  if (!signature) return fail(404, 'NOT_FOUND', 'החתימה לא נמצאה');

  if (action === 'approve') {
    if (signature.status !== 'pending') return fail(409, 'INVALID_STATE', 'החתימה כבר טופלה');
    const lines = await env.DB.prepare('SELECT equipment_item_id,issued_quantity FROM equipment_signature_lines WHERE signature_id=?').bind(signatureId).all();
    const transactionId = id();
    await env.DB.batch([
      env.DB.prepare(`UPDATE equipment_signatures SET status='approved',approved_by=?,approved_at=?,updated_at=? WHERE id=?`).bind(user.id, timestamp, timestamp, signatureId),
      env.DB.prepare(`UPDATE soldiers SET approval_status='approved',approved_at=COALESCE(approved_at,?),updated_at=?,version=version+1 WHERE id=?`).bind(timestamp, timestamp, signature.soldier_id),
      env.DB.prepare(`INSERT INTO equipment_transactions(id,soldier_id,type,status,actor_user_id,note,created_at) VALUES(?,?,'issue','completed',?,'אישור חתימת ציוד',?)`).bind(transactionId, signature.soldier_id, user.id, timestamp),
      ...(lines.results as Array<{ equipment_item_id: string; issued_quantity: number }>).map((line) => env.DB.prepare(`INSERT INTO equipment_transaction_lines(id,transaction_id,equipment_item_id,quantity) VALUES(?,?,?,?)`).bind(id(), transactionId, line.equipment_item_id, line.issued_quantity)),
    ]);
    return json({ ok: true, status: 'approved' });
  }
  if (action === 'reject') {
    if (signature.status !== 'pending') return fail(409, 'INVALID_STATE', 'החתימה כבר טופלה');
    await env.DB.prepare(`UPDATE equipment_signatures SET status='rejected',approved_by=?,updated_at=? WHERE id=?`).bind(user.id, timestamp, signatureId).run();
    return json({ ok: true, status: 'rejected' });
  }
  if (signature.status !== 'approved') return fail(409, 'INVALID_STATE', 'אפשר לזכות ציוד רק לאחר אישור החתימה');
  if (action === 'return_item') {
    const lineId = String(input.lineId ?? '');
    const delta = Number(input.delta);
    if (![-1, 1].includes(delta)) return fail(422, 'INVALID_DELTA', 'כמות הזיכוי אינה תקינה');
    const line = await env.DB.prepare('SELECT equipment_item_id,issued_quantity,returned_quantity FROM equipment_signature_lines WHERE id=? AND signature_id=?').bind(lineId, signatureId).first<{ equipment_item_id: string; issued_quantity: number; returned_quantity: number }>();
    if (!line) return fail(404, 'LINE_NOT_FOUND', 'פריט הציוד לא נמצא');
    const next = line.returned_quantity + delta;
    if (next < 0 || next > line.issued_quantity) return fail(409, 'RETURN_LIMIT', 'לא ניתן לזכות מעבר לכמות שנחתמה');
    await env.DB.prepare('UPDATE equipment_signature_lines SET returned_quantity=?,updated_at=? WHERE id=?').bind(next, timestamp, lineId).run();
    if (delta > 0) {
      const transactionId = id();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO equipment_transactions(id,soldier_id,type,status,actor_user_id,note,created_at) VALUES(?,?,'return','completed',?,'זיכוי פריט',?)`).bind(transactionId, signature.soldier_id, user.id, timestamp),
        env.DB.prepare(`INSERT INTO equipment_transaction_lines(id,transaction_id,equipment_item_id,quantity) VALUES(?,?,?,1)`).bind(id(), transactionId, line.equipment_item_id),
      ]);
    }
    return json({ ok: true, returnedQuantity: next });
  }
  if (action === 'return_all') {
    const remaining = await env.DB.prepare('SELECT equipment_item_id,issued_quantity-returned_quantity quantity FROM equipment_signature_lines WHERE signature_id=? AND returned_quantity<issued_quantity').bind(signatureId).all();
    const transactionId = id();
    const lines = remaining.results as Array<{ equipment_item_id: string; quantity: number }>;
    if (!lines.length) return json({ ok: true, status: 'returned' });
    await env.DB.batch([
      env.DB.prepare('UPDATE equipment_signature_lines SET returned_quantity=issued_quantity,updated_at=? WHERE signature_id=?').bind(timestamp, signatureId),
      env.DB.prepare(`INSERT INTO equipment_transactions(id,soldier_id,type,status,actor_user_id,note,created_at) VALUES(?,?,'return','completed',?,'זיכוי מלא',?)`).bind(transactionId, signature.soldier_id, user.id, timestamp),
      ...lines.map((line) => env.DB.prepare(`INSERT INTO equipment_transaction_lines(id,transaction_id,equipment_item_id,quantity) VALUES(?,?,?,?)`).bind(id(), transactionId, line.equipment_item_id, line.quantity)),
    ]);
    return json({ ok: true, status: 'returned' });
  }
  return fail(422, 'INVALID_ACTION', 'הפעולה אינה נתמכת');
};
