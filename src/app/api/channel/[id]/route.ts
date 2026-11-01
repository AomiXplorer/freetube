import { NextResponse } from "next/server";
import { getChannel } from "@/lib/innertube/endpoints/browse";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  try {
    const channel = await getChannel(id, url.searchParams.get("params") ?? undefined);
    return NextResponse.json(channel, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "channel_failed", message: (error as Error).message },
      { status: 502 },
    );
  }
}
