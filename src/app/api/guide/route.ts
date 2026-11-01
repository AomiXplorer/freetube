import { NextResponse } from "next/server";
import { getGuide } from "@/lib/innertube/endpoints/browse";

export const runtime = "edge";

export async function GET() {
  const entries = await getGuide();
  return NextResponse.json({ entries }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
}
