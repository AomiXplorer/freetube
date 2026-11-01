import { describe, expect, it } from "vitest";
import {
  classifyPollError,
  needsRefresh,
  REFRESH_WINDOW_MS,
  tokenBundleFromResponse,
} from "@/lib/auth/oauth";

/**
 * The token vault must refresh before expiry (a request that races the clock
 * gets a 401 that looks like "signed out") and must keep the existing refresh
 * token when Google does not return a new one - dropping it would log the user
 * out an hour after sign-in.
 */
describe("oauth tokens", () => {
  it("refreshes inside the safety window and not before", () => {
    const now = 1_700_000_000_000;
    const fresh = { expiresAt: now + 30 * 60_000 };
    const nearlyExpired = { expiresAt: now + REFRESH_WINDOW_MS - 1 };

    expect(needsRefresh(fresh, now)).toBe(false);
    expect(needsRefresh(nearlyExpired, now)).toBe(true);
  });

  it("builds a bundle from a token response", () => {
    const now = 1_700_000_000_000;
    const bundle = tokenBundleFromResponse(
      { access_token: "ya29.access", refresh_token: "1//refresh", expires_in: 3599, scope: "youtube" },
      undefined,
      now,
    );

    expect(bundle).not.toBeNull();
    expect(bundle?.accessToken).toBe("ya29.access");
    expect(bundle?.refreshToken).toBe("1//refresh");
    expect(bundle?.expiresAt).toBe(now + 3599 * 1000);
    expect(bundle?.scope).toBe("youtube");
  });

  it("keeps the previous refresh token when a refresh response omits it", () => {
    const now = 1_700_000_000_000;
    const bundle = tokenBundleFromResponse(
      { access_token: "ya29.new", expires_in: 3600 },
      { refreshToken: "1//kept" },
      now,
    );
    expect(bundle?.refreshToken).toBe("1//kept");
  });

  it("rejects a response without an access token", () => {
    expect(tokenBundleFromResponse({ error: "invalid_grant" })).toBeNull();
  });

  it("maps device-flow errors onto UI states", () => {
    expect(classifyPollError("authorization_pending")).toEqual({ status: "pending" });
    expect(classifyPollError("slow_down")).toEqual({ status: "slow_down" });
    expect(classifyPollError("expired_token")).toEqual({ status: "expired" });
    expect(classifyPollError("access_denied").status).toBe("denied");
    expect(classifyPollError("something_else").status).toBe("denied");
  });
});
