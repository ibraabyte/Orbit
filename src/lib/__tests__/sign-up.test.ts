import { describe, expect, it } from "vitest";
import { deviceTimeZone, signUpProblem } from "@/lib/sign-up";

describe("sign up", () => {
  it("checks the form before calling the server", () => {
    expect(signUpProblem({ email: "me@example", password: "long enough", confirm: "long enough" })).toBe("Enter a valid email.");
    expect(signUpProblem({ email: "me@example.com", password: "short", confirm: "short" })).toMatch(/at least 8/);
    expect(signUpProblem({ email: "me@example.com", password: "long enough", confirm: "long enougH" })).toBe("The passwords don't match.");
    expect(signUpProblem({ email: " me@example.com ", password: "long enough", confirm: "long enough" })).toBeNull();
  });

  it("sends the phone's time zone", () => {
    // vitest.config.mts pins TZ to Asia/Riyadh.
    expect(deviceTimeZone()).toBe("Asia/Riyadh");
  });
});
