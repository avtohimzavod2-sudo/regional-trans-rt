// Role authorization for Artur (AGENTS Master Architecture spec s.16/s.28).
// DispatcherUser.role is a free-text String (no DB enum) — mirrors
// src/lib/tyyin/role.ts / src/lib/sapargul/role.ts / src/lib/adilet/role.ts.
// Pure and dependency-free so it is directly unit-testable.

// Only the Founder (or admin, as an operational break-glass — same pattern
// as OWNER_ROLES in src/lib/tyyin/role.ts) may decide on a weekly strategic
// initiative or be the recorded recipient of an emergency escalation (spec
// s.16/s.28: "The Founder remains the final authority").
const FOUNDER_ROLES = new Set(["founder", "admin"]);

export function isFounderRole(role: string): boolean {
  return FOUNDER_ROLES.has(role.toLowerCase());
}

export class NotFounderRoleError extends Error {
  constructor(role: string) {
    super(`Role "${role}" is not authorized for Founder-level decisions — only founder/admin may (AGENTS Master Architecture spec s.16/s.28).`);
    this.name = "NotFounderRoleError";
  }
}

export function requireFounderRole(role: string): void {
  if (!isFounderRole(role)) throw new NotFounderRoleError(role);
}
