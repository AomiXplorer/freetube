import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { openJson } from "@/lib/auth/crypto";
import { fetchProfile, pollDeviceFlow } from "@/lib/auth/oauth";
import { saveTokenBundle } from "@/lib/auth/tokens";

export const runtime = "nodejs";

const DEVICE_COOKIE = "ft_device";

/** Poll the device flow once. The client repeats this on the returned interval. */
export async function POST() {
  const jar = await cookies();
  const payload = jar.get(DEVICE_COOKIE)?.value;
  const pending = payload ? await openJson<{ deviceCode: string; expiresAt: number }>(payload) : null;

  if (!pending?.deviceCode) {
    return NextResponse.json({ status: "expired", message: "Start the sign-in again." }, { status: 410 });
  }
  if (pending.expiresAt < Date.now()) {
    jar.delete(DEVICE_COOKIE);
    return NextResponse.json({ status: "expired", message: "The code expired." }, { status: 410 });
  }

  const result = await pollDeviceFlow(pending.deviceCode).catch(() => ({
    status: "pending" as const,
  }));

  if (result.status === "ok") {
    const profile = (await fetchProfile(result.tokens.accessToken)) ?? {};
    await saveTokenBundle({ ...result.tokens, profile });
    jar.delete(DEVICE_COOKIE);
    return NextResponse.json({ status: "ok", profile });
  }

  if (result.status === "expired" || result.status === "denied") {
    jar.delete(DEVICE_COOKIE);
    return NextResponse.json(
      { status: result.status, message: "message" in result ? result.message : undefined },
      { status: 400 },
    );
  }

  return NextResponse.json({ status: result.status });
}

/** Abandon an in-flight device flow. */
export async function DELETE() {
  const jar = await cookies();
  jar.delete(DEVICE_COOKIE);
  return NextResponse.json({ status: "cancelled" });
}
