import { body, fail, id, json, now, requireUser, type Env } from '../../../_shared/http';
export const onRequestPatch: PagesFunction<Env> = async ({request,env,params}) => {
  const user = await requireUser(request,env,'armory'); if(user instanceof Response) return user;
  const input = await body(request); if(input instanceof Response) return input;
  const depositId=String(params.id??''); const action=String(input.action??''); const timestamp=now();
  const row=await env.DB.prepare('SELECT * FROM weapon_deposits WHERE id=?').bind(depositId).first<Record<string,unknown>>();
  if(!row) return fail(404,'NOT_FOUND','בקשת האפסון לא נמצאה');
  if(action==='approve'){
    if(row.status!=='pending') return fail(409,'INVALID_STATE','הבקשה כבר טופלה');
    const duplicate=await env.DB.prepare(`SELECT id FROM operational_assets WHERE module='armory' AND lower(serial_number)=lower(?) AND status='active'`).bind(row.weapon_serial).first();
    if(duplicate) return fail(409,'DUPLICATE_WEAPON','מספר הנשק כבר רשום בארמון');
    const assets=[{category:'נשק',name:'נשק',serial:row.weapon_serial},{category:'אמר״ל',name:'אמר״ל',serial:row.amral_serial},{category:'כוונת',name:'כוונת',serial:row.scope_serial}].filter(x=>x.serial);
    await env.DB.batch([
      env.DB.prepare(`UPDATE weapon_deposits SET status='approved',approved_by=?,approved_at=?,updated_at=? WHERE id=?`).bind(user.id,timestamp,timestamp,depositId),
      ...assets.map(asset=>env.DB.prepare(`INSERT INTO operational_assets(id,module,category,name,serial_number,owner_name,location,metadata_json,created_at,updated_at) VALUES(?,'armory',?,?,?,?,'armory',?,?,?)`).bind(id(),asset.category,asset.name,String(asset.serial),String(row.full_name??''),JSON.stringify({depositId,soldierId:row.soldier_id}),timestamp,timestamp)),
    ]);
    return json({ok:true,status:'approved'});
  }
  if(action==='return'){
    if(row.status!=='approved') return fail(409,'INVALID_STATE','אפשר להחזיר רק נשק שנקלט בארמון');
    await env.DB.batch([
      env.DB.prepare(`UPDATE weapon_deposits SET status='returned',returned_by=?,returned_at=?,updated_at=? WHERE id=?`).bind(user.id,timestamp,timestamp,depositId),
      env.DB.prepare(`UPDATE operational_assets SET status='archived',location='returned_to_soldier',updated_at=?,version=version+1 WHERE module='armory' AND json_extract(metadata_json,'$.depositId')=?`).bind(timestamp,depositId),
    ]);
    return json({ok:true,status:'returned'});
  }
  if(action==='reject'){
    if(row.status!=='pending') return fail(409,'INVALID_STATE','הבקשה כבר טופלה');
    await env.DB.prepare(`UPDATE weapon_deposits SET status='rejected',updated_at=? WHERE id=?`).bind(timestamp,depositId).run();
    return json({ok:true,status:'rejected'});
  }
  return fail(422,'INVALID_ACTION','הפעולה אינה נתמכת');
};
