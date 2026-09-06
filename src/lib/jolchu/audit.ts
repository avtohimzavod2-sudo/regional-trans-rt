// Persistence for one resolved Jolchu request — kept separate from
// orchestrator.ts so the orchestrator's decision logic stays readable and
// so tests can call resolveRouteIntelligence with persist:false without any
// database involvement (mirrors src/lib/mira/training/benchmark.ts's
// persist:false convention).
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { ProviderExecutionLog } from "./location/resolver";
import type { LocationAmbiguityCandidate, ResolvedLocation, RouteIntelligenceResult } from "./types";

export interface PersistJolchuRequestInput {
  reasonCode: string;
  conversationId?: string | null;
  traceId?: string | null;
  latencyMs: number;
  providerExecutions: ProviderExecutionLog[];
  result: RouteIntelligenceResult;
  rawInputSanitized: string;
}

function locationRole(location: ResolvedLocation): string {
  return location.role;
}

export async function persistJolchuRequest(input: PersistJolchuRequestInput): Promise<string> {
  const { result } = input;
  const allLocations = [result.origin, result.destination, ...result.waypoints].filter(
    (l): l is ResolvedLocation => l !== null,
  );

  const requestId = await db.$transaction(async (tx) => {
    const request = await tx.jolchuRequest.create({
      data: {
        traceId: input.traceId ?? null,
        conversationId: input.conversationId ?? null,
        reasonCode: input.reasonCode,
        inputType: allLocations[0]?.sourceType ?? "UNKNOWN",
        rawInputSanitized: input.rawInputSanitized,
        status: result.status,
        confidence: result.confidence,
        ambiguity: result.ambiguity,
        requiresConfirmation: result.requiresHumanOrUserConfirmation,
        warnings: result.warnings,
        errorMessage: result.errorMessage,
        latencyMs: input.latencyMs,
      },
    });

    for (const location of allLocations) {
      await tx.jolchuResolvedLocation.create({
        data: {
          requestId: request.id,
          role: locationRole(location),
          latitude: location.latitude,
          longitude: location.longitude,
          formattedAddress: location.formattedAddress,
          country: location.country,
          region: location.region,
          district: location.district,
          settlement: location.settlement,
          locality: location.locality,
          street: location.street,
          house: location.house,
          landmark: location.landmark,
          provider: location.provider,
          confidence: location.confidence,
          ambiguity: location.ambiguity,
          sourceType: location.sourceType,
        },
      });
    }

    if (result.route) {
      const routeCalc = await tx.jolchuRouteCalculation.create({
        data: {
          requestId: request.id,
          provider: result.route.provider,
          roadDistanceKm: result.route.roadDistanceKm,
          straightLineDistanceKm: result.route.straightLineDistanceKm,
          estimatedDurationMin: result.route.estimatedDurationMin,
          trafficAwareDurationMin: result.route.trafficAwareDurationMin,
          trafficStatus: result.route.trafficStatus,
          trafficDelayMinutes: result.route.trafficDelayMinutes,
          tollFlag: result.route.tollFlag,
          ferryFlag: result.route.ferryFlag,
          unpavedRoadFlag: result.route.unpavedRoadFlag,
          roadClosureFlag: result.route.roadClosureFlag,
          mainRouteDistanceKm: result.route.mainRouteDistanceKm,
          lastMileDetected: result.route.lastMile.detected,
          lastMileDistanceKm: result.route.lastMile.distanceKm,
          totalDistanceKm: result.route.totalDistanceKm,
          confidence: result.route.confidence,
          warnings: result.route.warnings,
        },
      });

      for (const leg of result.route.legs) {
        await tx.jolchuRouteSegmentRecord.create({
          data: {
            routeCalculationId: routeCalc.id,
            order: leg.order,
            kind: leg.kind,
            fromLabel: leg.fromLabel,
            toLabel: leg.toLabel,
            distanceKm: leg.distanceKm,
            durationMin: leg.durationMin,
          },
        });
      }
    }

    if (result.ambiguityCandidates && result.ambiguityCandidates.length > 0) {
      await tx.jolchuLocationAmbiguity.create({
        data: {
          requestId: request.id,
          rawInput: input.rawInputSanitized,
          candidates: result.ambiguityCandidates as unknown as Prisma.InputJsonValue,
          confidence: result.confidence,
        },
      });
    }

    for (const [i, execution] of input.providerExecutions.entries()) {
      await tx.jolchuProviderExecution.create({
        data: {
          requestId: request.id,
          kind: execution.kind,
          provider: execution.provider,
          purpose: execution.purpose,
          attemptOrder: execution.attemptOrder ?? i + 1,
          ok: execution.ok,
          latencyMs: execution.latencyMs,
          errorMessage: execution.errorMessage,
        },
      });
    }

    return request.id;
  });

  return requestId;
}

export type { LocationAmbiguityCandidate };
