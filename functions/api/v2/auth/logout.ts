import { cookie, json, sessionCookie, sha256, type Env } from '../../../_shared/http';
export const onRequestPost: PagesFunction<Env> = async ({request,env}) => { const raw=cookie(request,'armory_session'); if(raw) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(raw)).run(); return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)}); };
