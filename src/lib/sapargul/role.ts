// Role authorization for the financial contour (AGENTS spec s.4/s.27/s.5).
// DispatcherUser.role is a free-text String (no DB enum) — see
// src/lib/auth/session.ts — so this is purely an application-layer gate.
// Pure and dependency-free so the gate itself is directly unit-testable
// without a session/cookie fixture.

// Any authenticated dispatcher may run Sapargul's own operational actions
// (create a payment request, issue instructions, record evidence, run a
// preliminary check, flag a discrepancy, prepare a report) — spec s.27.
// Only these two roles may ever confirm/reject a real money receipt.
const TREASURY_ROLES = new Set(["treasurer", "admin"]);

export function isTreasuryRole(role: string): boolean {
  return TREASURY_ROLES.has(role.toLowerCase());
}

export class NotTreasurerError extends Error {
  constructor(role: string) {
    super(`Role "${role}" is not authorized to confirm/reject actual payment receipt — only treasurer/admin may (AGENTS spec s.4/s.27).`);
    this.name = "NotTreasurerError";
  }
}

/** Throws unless the given role may perform a treasury (final financial
 * confirmation) action. Sapargul, Sapar, and a plain dispatcher must never
 * be able to bypass this (spec s.27's DISPATCHER bullet). */
export function requireTreasuryRole(role: string): void {
  if (!isTreasuryRole(role)) throw new NotTreasurerError(role);
}
