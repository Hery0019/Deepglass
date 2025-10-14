import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "../src/core/index";

describe("core smoke test", () => {
  it("exposes a version string", () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
