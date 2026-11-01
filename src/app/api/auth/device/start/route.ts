import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sealJson } from "@/lib/auth/crypto";
import { startDeviceFlow } from "@/lib/auth/oauth";

export const runtime = "nodejs";

const DEVICE_COOKIE = "ft_device";

/**
 * Begin the TV device flow. The device_code stays sealed in an httpOnly cookie:
 * it is the only thing that can exchange for a token, so it never reaches the page.
 */
export async function POST() {
  try {
    const start = await startDeviceFlow();
    const jar = await cookies();
    jar.set(
      DEVICE_COOKIE,
      await sealJson({ deviceCode: start.deviceCode, expiresAt: start.expiresAt }),
      {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: Math.max(60, Math.floor((start.expiresAt - Date.now()) / 1000)),
      },
    );
    return NextResponse.json({
      userCode: start.userCode,
      verificationUrl: start.verificationUrl,
      expiresAt: start.expiresAt,
      intervalSeconds: start.intervalSeconds,
    });
  } catch (error) {
    console.error("[auth] device_start_error", (error as Error).message);
    return NextResponse.json({ error: "device_start_failed" }, { status: 502 });
  }
}
