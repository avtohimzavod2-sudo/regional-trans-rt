"use client";

// Persistent Dispatcher UI TEST/LIVE indicator (hardening sprint s.13).
// Polls the existing GET /api/health endpoint — the same aggregation point
// already used for readiness checks — and classifies its `modes` field via
// src/lib/observability/rt-mode.ts. This component never reads env vars or
// any config layer itself: /api/health is the only source of truth, so
// there is nothing here to fall out of sync with it. Read-only: there is no
// control here to change any mode from the browser.
import { useEffect, useState } from "react";
import { classifyRtMode, type RtMode } from "@/lib/observability/rt-mode";

const POLL_INTERVAL_MS = 30_000;

async function fetchRtMode(): Promise<RtMode> {
  let response: Response;
  try {
    response = await fetch("/api/health", { cache: "no-store" });
  } catch {
    return { kind: "UNKNOWN", subsystems: [], reason: "/api/health request failed" };
  }
  if (!response.ok) {
    return { kind: "UNKNOWN", subsystems: [], reason: `/api/health returned status ${response.status}` };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "UNKNOWN", subsystems: [], reason: "/api/health response was not valid JSON" };
  }
  const modes = body !== null && typeof body === "object" ? (body as Record<string, unknown>).modes : undefined;
  return classifyRtMode(modes);
}

const STYLE_BY_KIND: Record<RtMode["kind"], { label: string; background: string; color: string }> = {
  LIVE: { label: "LIVE", background: "#c0392b", color: "#fff" },
  TEST: { label: "TEST MODE", background: "#2e7d32", color: "#fff" },
  MIXED: { label: "MIXED / UNSAFE CONFIG", background: "#e67e22", color: "#fff" },
  UNKNOWN: { label: "UNKNOWN / SAFETY CHECK REQUIRED", background: "#7f8c8d", color: "#fff" },
};

export function RtModeIndicator() {
  const [mode, setMode] = useState<RtMode>({ kind: "UNKNOWN", subsystems: [], reason: "not loaded yet" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const next = await fetchRtMode();
      if (!cancelled) setMode(next);
    }

    load();
    const intervalId = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const style = STYLE_BY_KIND[mode.kind];
  const showSubsystems = mode.kind === "MIXED" || mode.kind === "UNKNOWN";

  return (
    <div
      data-testid="rt-mode-indicator"
      data-rt-mode={mode.kind}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.25rem 0.75rem",
        borderRadius: "999px",
        background: style.background,
        color: style.color,
        fontWeight: 600,
        fontSize: "0.85rem",
      }}
    >
      <span>{style.label}</span>
      {showSubsystems && mode.subsystems.length > 0 && (
        <span data-testid="rt-mode-subsystems" style={{ fontWeight: 400 }}>
          ({mode.subsystems.map((s) => `${s.name}: ${s.raw ?? "invalid"}`).join(", ")})
        </span>
      )}
    </div>
  );
}
