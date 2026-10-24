import { PERMISSIONS, PermissionScope } from '@barbershop/shared';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { Effective } from '../common/types';

const CATALOG = new Map(PERMISSIONS.map((p) => [p.key, p]));

/** Validates keys/scopes against the catalog; returns a clean map. */
export function validatePermissionMap(input: Record<string, string>): Record<string, PermissionScope> {
  const out: Record<string, PermissionScope> = {};
  const problems: { field: string; message: string }[] = [];
  for (const [key, scope] of Object.entries(input)) {
    const def = CATALOG.get(key);
    if (!def) problems.push({ field: key, message: 'Unknown permission' });
    else if (scope !== 'all' && scope !== 'own') problems.push({ field: key, message: 'Scope must be "all" or "own"' });
    else if (scope === 'own' && !def.supportsOwn) problems.push({ field: key, message: '"own" scope is not supported for this permission' });
    else out[key] = scope;
  }
  if (problems.length) throw new AppException(400, ErrorCodes.VALIDATION_FAILED, 'Some permissions are invalid.', problems);
  return out;
}

/** Privilege-escalation guard: you can only hand out what you hold yourself (owners can hand out anything). */
export function assertCanGrant(actor: Effective, requested: Record<string, PermissionScope>) {
  if (actor.isOwner) return;
  for (const [key, scope] of Object.entries(requested)) {
    const have = actor.map.get(key);
    if (!have || (scope === 'all' && have !== 'all')) {
      throw new AppException(403, ErrorCodes.FORBIDDEN, `You can't grant "${key}" because you don't hold that permission yourself.`);
    }
  }
}
