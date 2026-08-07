import { body, fail, json, now, requireUser, type Env } from '../../../_shared/http';
export const onRequestPatch: PagesFunction<Env> = async ({request,env,params}) => {
  const user=await requireUser(request,env,'faults'); if(user instanceof Response) return user;
  const input=await body(request); if(input instanceof Response) return input;
  const status=String(input.status??'');
  if(!['open','in_progress','resolved','closed'].includes(status)) return fail(422,'INVALID_STATUS','הסטטוס אינו תקין');
  const timestamp=now();
  const result=await env.DB.prepare('UPDATE building_faults SET status=?,handled_by=?,resolved_at=?,updated_at=? WHERE id=?').bind(status,user.id,['resolved','closed'].includes(status)?timestamp:null,timestamp,String(params.id??'')).run();
  if(!result.meta.changes) return fail(404,'NOT_FOUND','התקלה לא נמצאה');
  return json({ok:true,status});
};
