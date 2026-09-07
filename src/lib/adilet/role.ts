// Role authorization for Adilet (AGENTS Adilet spec s.18/s.25/s.54).
// DispatcherUser.role is a free-text String (no DB enum) — see
// src/lib/auth/session.ts — so this is purely an application-layer gate,
// mirroring src/lib/sapargul/role.ts. Pure and dependency-free so the gate
// itself is directly unit-testable without a session/cookie fixture.

// Any authenticated dispatcher may open a case, attach evidence, or record
// an ordinary decision (spec s.2's escalation-driven engagement). Only
// these roles may resolve an appeal — that's the AI Director's review
// boundary (spec s.18), never a plain dispatcher or the manager whose
// department the case touches.
const DIRECTOR_REVIEW_ROLES = new Set(["director", "admin"]);

export function isDirectorReviewRole(role: string): boolean {
  return DIRECTOR_REVIEW_ROLES.has(role.toLowerCase());
}

export class NotDirectorReviewRoleError extends Error {
  constructor(role: string) {
    super(`Role "${role}" is not authorized to resolve an Adilet appeal — only director/admin may (AGENTS Adilet spec s.18/s.25).`);
    this.name = "NotDirectorReviewRoleError";
  }
}

/** Throws unless the given role may resolve an appeal (uphold/modify/
 * overturn). A manager (Zholaman/Akzhol) must never be able to rewrite
 * Adilet's independent decision (spec s.23/s.24). */
export function requireDirectorReviewRole(role: string): void {
  if (!isDirectorReviewRole(role)) throw new NotDirectorReviewRoleError(role);
}
