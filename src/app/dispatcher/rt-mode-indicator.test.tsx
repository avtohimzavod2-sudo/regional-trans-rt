// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { RtModeIndicator } from "./rt-mode-indicator";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("RtModeIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders TEST MODE when every subsystem reports sandbox/dry-run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ modes: { miraOutbound: "DRY_RUN", acquisitionOutreach: "SANDBOX", treasury: "SANDBOX" } })
      )
    );

    render(<RtModeIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    const indicator = screen.getByTestId("rt-mode-indicator");
    expect(indicator.dataset.rtMode).toBe("TEST");
    expect(indicator.textContent).toContain("TEST MODE");
  });

  it("renders LIVE when every subsystem reports live/production", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ modes: { miraOutbound: "LIVE", acquisitionOutreach: "LIVE", treasury: "PRODUCTION" } })
      )
    );

    render(<RtModeIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    const indicator = screen.getByTestId("rt-mode-indicator");
    expect(indicator.dataset.rtMode).toBe("LIVE");
    expect(indicator.textContent).toContain("LIVE");
  });

  it("renders MIXED / UNSAFE CONFIG with a subsystem breakdown when modes disagree, never an overall LIVE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ modes: { miraOutbound: "LIVE", acquisitionOutreach: "SANDBOX", treasury: "SANDBOX" } })
      )
    );

    render(<RtModeIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    const indicator = screen.getByTestId("rt-mode-indicator");
    expect(indicator.dataset.rtMode).toBe("MIXED");
    expect(indicator.textContent).toContain("MIXED / UNSAFE CONFIG");
    const subsystems = screen.getByTestId("rt-mode-subsystems");
    expect(subsystems.textContent).toContain("miraOutbound: LIVE");
    expect(subsystems.textContent).toContain("acquisitionOutreach: SANDBOX");
  });

  it("renders UNKNOWN / SAFETY CHECK REQUIRED when a subsystem reports an unrecognized value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ modes: { miraOutbound: "LIVE", treasury: "SOMETHING_NEW" } }))
    );

    render(<RtModeIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    const indicator = screen.getByTestId("rt-mode-indicator");
    expect(indicator.dataset.rtMode).toBe("UNKNOWN");
    expect(indicator.textContent).toContain("UNKNOWN / SAFETY CHECK REQUIRED");
  });

  it("renders UNKNOWN, never LIVE, when the /api/health request itself fails (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<RtModeIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    const indicator = screen.getByTestId("rt-mode-indicator");
    expect(indicator.dataset.rtMode).toBe("UNKNOWN");
  });

  it("renders UNKNOWN, never LIVE, when /api/health returns a non-OK HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));

    render(<RtModeIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("rt-mode-indicator").dataset.rtMode).toBe("UNKNOWN");
  });

  it("renders UNKNOWN, never LIVE, when the response body is malformed (JSON parse failure)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })
    );

    render(<RtModeIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("rt-mode-indicator").dataset.rtMode).toBe("UNKNOWN");
  });

  it("renders UNKNOWN before the first fetch resolves, and is visible without opening any menu", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ modes: { miraOutbound: "LIVE" } })));

    render(<RtModeIndicator />);

    const indicator = screen.getByTestId("rt-mode-indicator");
    expect(indicator.dataset.rtMode).toBe("UNKNOWN");
  });

  it("refreshes on its poll interval, picking up a mode change without a remount", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ modes: { miraOutbound: "DRY_RUN" } }))
      .mockResolvedValueOnce(jsonResponse({ modes: { miraOutbound: "LIVE" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RtModeIndicator />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("rt-mode-indicator").dataset.rtMode).toBe("TEST");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("rt-mode-indicator").dataset.rtMode).toBe("LIVE");
  });
});
