// Role authorization for Zholaman's delivery/cargo-direction report. Same
// application-layer pattern and same fail-closed rule as
// src/lib/akzhol/role.ts: an unrecognized role is refused, never defaulted to
// allow (spec s.16).
//
// Note what this gate does NOT grant. Nothing in the cargo direction's
// financial contour is reachable through it: confirming a payment stays behind
// the "treasurer"/"admin" gate in src/lib/sapargul/role.ts, and the only
// payment information this report carries is the coarse status collapse of
// spec s.21. A cargo manager and a cargo cashier are different posts held by
// different people, and this file is one half of keeping them that way.

const CARGO_DIRECTION_MANAGER_ROLES = new Set(["zholaman", "cargo_manager", "delivery_manager", "founder", "admin"]);

export function isCargoDirectionManagerRole(role: string): boolean {
  return CARGO_DIRECTION_MANAGER_ROLES.has(role.trim().toLowerCase());
}

export class NotCargoDirectionManagerRoleError extends Error {
  constructor(role: string) {
    super(`Role "${role}" is not authorized to read the delivery/cargo-direction management report — only zholaman/cargo_manager/delivery_manager/founder/admin may.`);
    this.name = "NotCargoDirectionManagerRoleError";
  }
}

export function requireCargoDirectionManagerRole(role: string): void {
  if (!isCargoDirectionManagerRole(role)) throw new NotCargoDirectionManagerRoleError(role);
}
