import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { ruleUpdateSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, boolToInt, safeJson } from '../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.rulesWrite);
  if (user instanceof Response) return user;
  const code = String(params.code);
  const input = await readBody(request, ruleUpdateSchema);
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    'SELECT enabled, overridable, severity, config FROM scheduling_rules WHERE org_id = ? AND code = ?',
  )
    .bind(DEFAULT_ORG_ID, code)
    .first<{ enabled: number; overridable: number; severity: string; config: string }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const config = input.config
    ? { ...safeJson<Record<string, number>>(existing.config, {}), ...input.config }
    : safeJson<Record<string, number>>(existing.config, {});

  await env.DB.prepare(
    `UPDATE scheduling_rules
        SET enabled = ?, severity = COALESCE(?, severity), overridable = ?, config = ?,
            updated_by = ?, updated_at = ?
      WHERE org_id = ? AND code = ?`,
  )
    .bind(
      boolToInt(input.enabled, existing.enabled),
      input.severity ?? null,
      boolToInt(input.overridable, existing.overridable),
      JSON.stringify(config),
      user.id,
      now(),
      DEFAULT_ORG_ID,
      code,
    )
    .run();

  await writeAudit(env, user, AuditActions.RULE_UPDATED, 'scheduling_rule', code, {
    enabled: input.enabled,
    severity: input.severity,
    config: input.config,
  });
  return ok({ code });
};
