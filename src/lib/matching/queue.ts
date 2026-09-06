import type { Prisma } from "@prisma/client";

/**
 * Build the DriverOffer to create once a trip completes, putting the driver
 * back in queue for the return leg (destination -> origin of the finished trip).
 */
export function buildReturnLegOfferInput(params: {
  driverId: string;
  originStopId: string; // destination of the completed trip
  destinationStopId: string; // origin of the completed trip
  travelDate: Date;
  seatsTotal: number;
  generatedFromTripId: string;
}): Prisma.DriverOfferCreateInput {
  return {
    driver: { connect: { id: params.driverId } },
    origin: { connect: { id: params.originStopId } },
    destination: { connect: { id: params.destinationStopId } },
    travelDate: params.travelDate,
    seatsTotal: params.seatsTotal,
    seatsAvailable: params.seatsTotal,
    status: "OPEN",
    sourceChannel: "TELEGRAM_BOT",
    isReturnLeg: true,
    generatedFromTrip: { connect: { id: params.generatedFromTripId } },
  };
}
