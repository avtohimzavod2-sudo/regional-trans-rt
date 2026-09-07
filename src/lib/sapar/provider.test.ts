import { describe, expect, it } from "vitest";
import { InternalMockDeliveryProvider, isMockProviderCode, MOCK_PROVIDER_CODE } from "./provider";

describe("isMockProviderCode", () => {
  it("flags RT's sandbox estimator as mock pricing", () => {
    expect(isMockProviderCode(MOCK_PROVIDER_CODE)).toBe(true);
    expect(isMockProviderCode("internal_mock")).toBe(true);
  });

  it("never flags a real provider code as mock", () => {
    expect(isMockProviderCode("some_real_courier_api")).toBe(false);
    expect(isMockProviderCode("")).toBe(false);
  });
});

describe("InternalMockDeliveryProvider", () => {
  it("tags its own quotes with the mock provider code, never an official one", () => {
    const provider = new InternalMockDeliveryProvider();
    expect(provider.providerCode).toBe(MOCK_PROVIDER_CODE);
    expect(isMockProviderCode(provider.providerCode)).toBe(true);
  });

  it("is always available since it never calls out to a real carrier", async () => {
    const provider = new InternalMockDeliveryProvider();
    await expect(provider.checkAvailability()).resolves.toBe(true);
  });
});
