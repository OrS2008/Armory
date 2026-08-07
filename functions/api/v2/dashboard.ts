import { json, requireUser, type Env } from '../../_shared/http';
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{const user=await requireUser(request,env);if(user instanceof Response)return user;const [soldiers,pending,outstanding,faults,deposits,shortages,fuel,items,recent]=await Promise.all([
  env.DB.prepare(`SELECT count(*) n FROM soldiers WHERE approval_status!='archived'`).first<{n:number}>(),
  env.DB.prepare(`SELECT count(*) n FROM equipment_signatures WHERE status='pending'`).first<{n:number}>(),
  env.DB.prepare(`SELECT COALESCE(sum(issued_quantity-returned_quantity),0) n FROM equipment_signature_lines l JOIN equipment_signatures s ON s.id=l.signature_id WHERE s.status='approved'`).first<{n:number}>(),
  env.DB.prepare(`SELECT count(*) n FROM building_faults WHERE status IN ('open','in_progress')`).first<{n:number}>(),
  env.DB.prepare(`SELECT count(*) n FROM weapon_deposits WHERE status='pending'`).first<{n:number}>(),
  env.DB.prepare(`SELECT count(*) n FROM submissions WHERE action_type='shortage' AND status IN ('pending','in_progress')`).first<{n:number}>(),
  env.DB.prepare(`SELECT count(*) cards,COALESCE(sum(litres_balance),0) litres FROM fuel_cards WHERE status='active'`).first<{cards:number;litres:number}>(),
  env.DB.prepare(`SELECT i.name,COALESCE(sum(l.issued_quantity),0) issued,COALESCE(sum(l.returned_quantity),0) returned FROM equipment_items i LEFT JOIN equipment_signature_lines l ON l.equipment_item_id=i.id LEFT JOIN equipment_signatures s ON s.id=l.signature_id AND s.status='approved' GROUP BY i.id,i.name ORDER BY issued DESC`).all(),
  env.DB.prepare(`SELECT es.id,es.status,es.signed_at created_at,s.full_name,'signature' kind FROM equipment_signatures es JOIN soldiers s ON s.id=es.soldier_id UNION ALL SELECT id,status,created_at,reporter_name,'fault' kind FROM building_faults ORDER BY created_at DESC LIMIT 8`).all(),
]);return json({ok:true,metrics:{soldiers:soldiers?.n??0,pending:pending?.n??0,outstanding:outstanding?.n??0,faults:faults?.n??0,deposits:deposits?.n??0,shortages:shortages?.n??0,fuelCards:fuel?.cards??0,fuelLitres:fuel?.litres??0},equipment:items.results,recent:recent.results})};
