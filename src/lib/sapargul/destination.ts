// PaymentDestination resolution (AGENTS spec s.8). Sapargul must never
// invent QR codes/requisites/accounts. In PRODUCTION, with no active
// destination configured, callers must surface
// PAYMENT_DESTINATION_NOT_CONFIGURED rather than fabricate one — this
// module is the single place that decision is made.
import type { PaymentDestination, PaymentDestinationEnvironment } from "@prisma/client";
import { db } from "@/lib/db";

/** Which environment Sapargul currently operates in — defaults to SANDBOX so
 * a fresh checkout never accidentally treats an unconfigured environment as
 * production. Set SAPARGUL_PAYMENT_ENV=PRODUCTION once a real, approved
 * PaymentDestination has been configured by an admin. */
export function currentPaymentEnvironment(): PaymentDestinationEnvironment {
  return process.env.SAPARGUL_PAYMENT_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
}

export class PaymentDestinationNotConfiguredError extends Error {
  constructor(environment: PaymentDestinationEnvironment) {
    super(`No active PaymentDestination configured for environment=${environment}. Refusing to invent requisites (AGENTS spec s.8).`);
    this.name = "PaymentDestinationNotConfiguredError";
  }
}

/** Returns the active destination for the current environment, or null if
 * none is configured — callers decide how to surface that (never by
 * fabricating one). */
export async function getActivePaymentDestination(
  environment: PaymentDestinationEnvironment = currentPaymentEnvironment(),
): Promise<PaymentDestination | null> {
  return db.paymentDestination.findFirst({
    where: { environment, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}
