// Role authorization for Tyyin (AGENTS Tyyin spec s.29/s.35/s.36).
// DispatcherUser.role is a free-text String (no DB enum) — see
// src/lib/auth/session.ts — so this is purely an application-layer gate,
// mirroring src/lib/sapargul/role.ts and src/lib/adilet/role.ts. Pure and
// dependency-free so each gate is directly unit-testable without a
// session/cookie fixture.

// Treasury-ops roles may trigger a SANDBOX-only simulated incoming
// transaction and manually re-run reconciliation for a stuck/unmatched
// transaction (spec s.27's "no unrestricted endpoint" — still gated, even
// though nothing here can move money out).
const TREASURY_OPS_ROLES = new Set(["treasurer", "admin", "tyyin"]);

// Only a real human accountant (or admin, as an operational break-glass) may
// record what they did outside this system — never Tyyin itself, never a
// plain dispatcher (spec s.24's "records but never executes").
const ACCOUNTANT_ROLES = new Set(["accountant", "admin"]);

// OWNER_DIRECT_CALL (spec s.28-s.30): the owner may see full honest
// financial status through Tyyin, but this role gate is the only thing that
// separates that view from an ordinary dispatcher — it must come from the
// trusted server-side session role, never a claimed context in request text
// (see src/lib/tyyin/owner.ts).
const OWNER_ROLES = new Set(["owner", "founder", "admin"]);

export function isTreasuryOpsRole(role: string): boolean {
  return TREASURY_OPS_ROLES.has(role.toLowerCase());
}

export function isAccountantRole(role: string): boolean {
  return ACCOUNTANT_ROLES.has(role.toLowerCase());
}

export function isOwnerRole(role: string): boolean {
  return OWNER_ROLES.has(role.toLowerCase());
}

export class NotTreasuryOpsRoleError extends Error {
  constructor(role: string) {
    super(`Role "${role}" is not authorized for Tyyin treasury operations — only treasurer/tyyin/admin may (AGENTS Tyyin spec s.27).`);
    this.name = "NotTreasuryOpsRoleError";
  }
}

export class NotAccountantRoleError extends Error {
  constructor(role: string) {
    super(`Role "${role}" is not authorized to record an accountant case resolution — only accountant/admin may (AGENTS Tyyin spec s.24).`);
    this.name = "NotAccountantRoleError";
  }
}

export class NotOwnerRoleError extends Error {
  constructor(role: string) {
    super(`Role "${role}" is not authorized for OWNER_DIRECT_CALL — only owner/founder/admin may (AGENTS Tyyin spec s.28-s.30).`);
    this.name = "NotOwnerRoleError";
  }
}

export function requireTreasuryOpsRole(role: string): void {
  if (!isTreasuryOpsRole(role)) throw new NotTreasuryOpsRoleError(role);
}

export function requireAccountantRole(role: string): void {
  if (!isAccountantRole(role)) throw new NotAccountantRoleError(role);
}

export function requireOwnerRole(role: string): void {
  if (!isOwnerRole(role)) throw new NotOwnerRoleError(role);
}
