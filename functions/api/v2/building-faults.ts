import { body, fail, id, json, now, requireUser, type Env } from '../../_shared/http';
const categories = new Set(['חשמל','מים','מיזוג','דלתות ומנעולים','תברואה','אחר']);
export const onRequestPost: PagesFunction<Env> = async ({request,env}) => {
  const input=await body(request); if(input instanceof Response) return input;
  const fullName=String(input.fullName??'').trim(); const phone=String(input.phone??'').replace(/\D/g,'');
  const location=String(input.location??'').trim(); const category=String(input.category??''); const description=String(input.description??'').trim();
  if(fullName.length<2||phone.length!==10||location.length<2||!categories.has(category)||description.length<10) return fail(422,'VALIDATION_ERROR','יש למלא מיקום ותיאור תקלה מפורט');
  const timestamp=now(); const faultId=id();
  await env.DB.prepare(`INSERT INTO building_faults(id,reporter_name,personal_id,phone,department,location,category,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(faultId,fullName,String(input.personalId??'').replace(/\D/g,'')||null,phone,String(input.department??'').trim()||null,location,category,description,timestamp,timestamp).run();
  return json({ok:true,id:faultId,status:'open'},201);
};
export const onRequestGet: PagesFunction<Env> = async ({request,env}) => {
  const user=await requireUser(request,env,'faults'); if(user instanceof Response) return user;
  const result=await env.DB.prepare('SELECT * FROM building_faults ORDER BY created_at DESC LIMIT 500').all();
  return json({ok:true,items:result.results});
};
