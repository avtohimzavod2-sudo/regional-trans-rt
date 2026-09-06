"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { runBenchmark } from "@/lib/mira/training/benchmark";
import { getMiraModelProvider } from "@/lib/mira/providers/model-provider";

async function currentDispatcher() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session) throw new Error("Not authenticated");
  return session;
}

// Runs the RT Kyrgyz Benchmark against whichever MiraModelProvider is
// currently configured (mock unless MIRA_AI_PROVIDER=google with real
// credentials), persists a MiraBenchmarkRun + per-case results, and — per
// the hard "never auto-promote" rule — writes at most a TRAINEE or
// CERTIFICATION_PENDING MiraCertification row (see certification.ts).
export async function runMiraBenchmarkAction() {
  const dispatcher = await currentDispatcher();
  const outcome = await runBenchmark({ provider: getMiraModelProvider(), persist: true });
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "mira.benchmark_run",
    entityType: "MiraBenchmarkRun",
    entityId: outcome.runId ?? "unpersisted",
    details: {
      provider: outcome.provider,
      totalCases: outcome.summary.totalCases,
      overallScore: outcome.summary.overallScore,
      certificationStatus: outcome.certification.status,
    },
  });
  revalidatePath("/dispatcher/mira");
  revalidatePath("/dispatcher/mira/benchmark");
  revalidatePath("/dispatcher/mira/certification");
}

// Human Language Review — a dispatcher grading one real or benchmark Mira
// answer. Scores are 1..5; hallucination is a hard boolean flag surfaced
// straight to the Training Failure Loop.
export async function addMiraHumanReviewAction(formData: FormData) {
  const dispatcher = await currentDispatcher();
  const input = String(formData.get("input") ?? "").trim();
  const miraAnswer = String(formData.get("miraAnswer") ?? "").trim();
  if (!input || !miraAnswer) throw new Error("input and miraAnswer are required");

  const grammar = optionalScore(formData.get("grammar"));
  const naturalness = optionalScore(formData.get("naturalness"));
  const meaning = optionalScore(formData.get("meaning"));
  const politeness = optionalScore(formData.get("politeness"));
  const dialectUnderstanding = optionalScore(formData.get("dialectUnderstanding"));
  const codeSwitchUnderstanding = optionalScore(formData.get("codeSwitchUnderstanding"));
  const hallucination = formData.get("hallucination") === "on";
  const comments = String(formData.get("comments") ?? "").trim() || null;

  const scores = [grammar, naturalness, meaning, politeness, dialectUnderstanding, codeSwitchUnderstanding].filter(
    (v): v is number => v !== null,
  );
  const overallScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const review = await db.miraHumanReview.create({
    data: {
      input,
      miraAnswer,
      grammar,
      naturalness,
      meaning,
      politeness,
      dialectUnderstanding,
      codeSwitchUnderstanding,
      hallucination,
      overallScore,
      comments,
      reviewedByAdminId: dispatcher.username,
    },
  });

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "mira.human_review_added",
    entityType: "MiraHumanReview",
    entityId: review.id,
    details: { hallucination, overallScore },
  });
  revalidatePath("/dispatcher/mira/reviews");
}

function optionalScore(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Marks a training-failure-loop entry as moved into the loop (i.e. a human
// has picked it up to turn into a benchmark case / training example) or
// resolved. Never deletes the row — the failure remains part of the audit
// trail even once addressed.
export async function updateMiraFailureStatusAction(failureId: string, status: "IN_TRAINING_LOOP" | "RESOLVED") {
  const dispatcher = await currentDispatcher();
  await db.miraLanguageFailure.update({ where: { id: failureId }, data: { status } });
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "mira.failure_status_updated",
    entityType: "MiraLanguageFailure",
    entityId: failureId,
    details: { status },
  });
  revalidatePath("/dispatcher/mira/failed-cases");
}
