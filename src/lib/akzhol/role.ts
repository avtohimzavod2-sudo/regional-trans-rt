// Role authorization for Akzhol's passenger-direction report. DispatcherUser.
// role is a free-text String (see src/lib/auth/session.ts), so this is an
// application-layer gate, mirroring src/lib/artur/role.ts and
// src/lib/tyyin/role.ts. Pure and dependency-free, so it is directly
// unit-testable without a session fixture.
//
// The report is aggregate operational data about RT's own passenger direction,
// with no money amounts and no personal contact details in it — but it is
// still management information, and an ordinary dispatcher has no business
// reading the direction's performance numbers. Gated, therefore, and gated
// fail-closed: an unrecognized role is refused, never defaulted to allow
// (spec s.16, "UNKNOWN authentication state must never mean ALLOW").

/** Passenger-direction management. "akzhol" is the role a human appointed to
 * that post would hold; founder/admin are the standing break-glass, the same
 * pattern as OWNER_ROLES in src/lib/tyyin/role.ts. */
const PASSENGER_DIRECTION_MANAGER_ROLES = new Set(["akzhol", "passenger_manager", "founder", "admin"]);

export function isPassengerDirectionManagerRole(role: string): boolean {
  return PASSENGER_DIRECTION_MANAGER_ROLES.has(role.trim().toLowerCase());
}

export class NotPassengerDirectionManagerRoleError extends Error {
  constructor(role: string) {
    super(`Role "${role}" is not authorized to read the passenger-direction management report — only akzhol/passenger_manager/founder/admin may.`);
    this.name = "NotPassengerDirectionManagerRoleError";
  }
}

export function requirePassengerDirectionManagerRole(role: string): void {
  if (!isPassengerDirectionManagerRole(role)) throw new NotPassengerDirectionManagerRoleError(role);
}
