import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    delete process.env.MIRA_OUTBOUND_MODE;
    delete process.env.ACQUISITION_OUTREACH_MODE;
    delete process.env.TYYIN_BANK_ENV;
  });

  it("reports ok status and the safe default mode for every gated surface when no env is set", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.modes).toEqual({
      miraOutbound: "DRY_RUN",
      acquisitionOutreach: "DRY_RUN",
      treasury: "SANDBOX",
    });
  });

  it("reflects LIVE/PRODUCTION modes when explicitly configured, never fabricating a safer status", async () => {
    process.env.MIRA_OUTBOUND_MODE = "LIVE";
    process.env.ACQUISITION_OUTREACH_MODE = "SANDBOX";
    process.env.TYYIN_BANK_ENV = "PRODUCTION";

    const body = await (await GET()).json();

    expect(body.modes).toEqual({
      miraOutbound: "LIVE",
      acquisitionOutreach: "SANDBOX",
      treasury: "PRODUCTION",
    });
  });
});
