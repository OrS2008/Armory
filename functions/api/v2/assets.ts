import { body, fail, id, json, now, requireUser, type Env } from '../../_shared/http';

const modules = ['inventory', 'armory', 'communications', 'ammunition', 'vehicles', 'fuel_cards'];

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const moduleName = new URL(request.url).searchParams.get('module');
  if (!moduleName || !modules.includes(moduleName))
    return fail(422, 'INVALID_MODULE', 'מודול אינו תקין');
  const result = await env.DB.prepare(
    'SELECT * FROM operational_assets WHERE module=? AND status<>? ORDER BY name',
  )
    .bind(moduleName, 'archived')
    .all();
  return json({ ok: true, items: result.results });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  if (user.role === 'viewer') return fail(403, 'FORBIDDEN', 'למשתמש צפייה אין הרשאת שינוי');
  const input = await body(request);
  if (input instanceof Response) return input;
  const moduleName = String(input.module ?? '');
  const name = String(input.name ?? '').trim();
  const category = String(input.category ?? '').trim();
  const quantity = Number(input.quantity ?? 1);
  if (
    !modules.includes(moduleName) ||
    name.length < 2 ||
    category.length < 2 ||
    !Number.isInteger(quantity) ||
    quantity < 0
  )
    return fail(422, 'VALIDATION_ERROR', 'פרטי הפריט אינם תקינים');
  const assetId = id();
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO operational_assets(id,module,category,name,serial_number,owner_name,quantity,location,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      assetId,
      moduleName,
      category,
      name,
      String(input.serialNumber ?? '').trim() || null,
      String(input.ownerName ?? '').trim() || null,
      quantity,
      'storage',
      '{}',
      timestamp,
      timestamp,
    )
    .run();
  await env.DB.prepare(
    'INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,safe_metadata,created_at) VALUES(?,?,?,?,?,?,?)',
  )
    .bind(
      id(),
      user.id,
      'asset_created',
      'operational_asset',
      assetId,
      JSON.stringify({ module: moduleName }),
      timestamp,
    )
    .run();
  return json({ ok: true, id: assetId }, 201);
};
