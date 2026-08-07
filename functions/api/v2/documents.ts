import { fail, id, json, now, requireUser, type Env } from '../../_shared/http';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const kinds = new Set(['signature', 'civilian_license', 'military_license', 'fuel_receipt']);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, 'INVALID_FORM', 'הקובץ לא התקבל');
  const file = form.get('file');
  const kind = String(form.get('kind') ?? '');
  if (!(file instanceof File) || !kinds.has(kind)) return fail(422, 'INVALID_DOCUMENT', 'יש לבחור מסמך תקין');
  if (!allowed.has(file.type) || file.size < 1 || file.size > 3_000_000)
    return fail(422, 'INVALID_FILE', 'אפשר להעלות JPG, PNG, WEBP או PDF עד 3MB');
  const key = `pending/${kind}/${id()}`;
  const bytes = await file.arrayBuffer();
  await env.DB.prepare('INSERT INTO private_documents(object_key,kind,original_name,content_type,byte_size,content,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(key, kind, file.name.slice(0, 120), file.type, file.size, bytes, now()).run();
  return json({ ok: true, key, name: file.name, type: file.type, size: file.size }, 201);
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, 'licenses');
  if (user instanceof Response) return user;
  const key = new URL(request.url).searchParams.get('key');
  if (!key || !/^(pending|soldiers)\/[a-z_]+\/[0-9a-f-]+$/.test(key)) return fail(400, 'INVALID_KEY', 'מפתח המסמך אינו תקין');
  const object = await env.DB.prepare('SELECT original_name,content_type,content FROM private_documents WHERE object_key=?').bind(key).first<{original_name:string;content_type:string;content:ArrayBuffer}>();
  if (!object) return fail(404, 'NOT_FOUND', 'המסמך לא נמצא');
  const headers = new Headers({ 'Content-Type': object.content_type });
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Disposition', `inline; filename="${object.original_name.replace(/["\\]/g, '')}"`);
  return new Response(object.content, { headers });
};
