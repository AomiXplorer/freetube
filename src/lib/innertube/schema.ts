/**
 * Zod validation for InnerTube responses.
 *
 * YouTube's payloads are huge and frequently extended, so we validate the
 * *shape we depend on* and pass everything else through untouched. A response
 * that fails validation is treated as a failed attempt and triggers client
 * rotation instead of crashing the route.
 */
import { z } from "zod";

export const innerTubeEnvelope = z
  .object({
    responseContext: z.object({}).passthrough().optional(),
    playabilityStatus: z
      .object({
        status: z.string(),
        reason: z.string().optional(),
        subreason: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const streamingFormat = z
  .object({
    itag: z.number(),
    url: z.string().url().optional(),
    signatureCipher: z.string().optional(),
    cipher: z.string().optional(),
    mimeType: z.string(),
    bitrate: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    contentLength: z.string().optional(),
    fps: z.number().optional(),
    qualityLabel: z.string().optional(),
    audioQuality: z.string().optional(),
    approxDurationMs: z.string().optional(),
  })
  .passthrough();

export const playerResponse = z
  .object({
    playabilityStatus: z
      .object({
        status: z.string(),
        reason: z.string().optional(),
        subreason: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
    videoDetails: z
      .object({
        // A blocked/unavailable response can still carry a partial videoDetails
        // block, and the TV client sometimes omits the title entirely. Treat it
        // as optional so a failing video degrades to the embed instead of a 502.
        videoId: z.string().optional(),
        title: z.string().optional(),
        lengthSeconds: z.string().optional(),
        shortDescription: z.string().optional(),
        viewCount: z.string().optional(),
        author: z.string().optional(),
        channelId: z.string().optional(),
        isLiveContent: z.boolean().optional(),
        keywords: z.array(z.string()).optional(),
        thumbnail: z.object({ thumbnails: z.array(z.any()) }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    streamingData: z
      .object({
        expiresInSeconds: z.string().optional(),
        formats: z.array(streamingFormat).optional(),
        adaptiveFormats: z.array(streamingFormat).optional(),
        hlsManifestUrl: z.string().optional(),
        dashManifestUrl: z.string().optional(),
      })
      .passthrough()
      .optional(),
    captions: z
      .object({
        playerCaptionsTracklistRenderer: z
          .object({
            captionTracks: z
              .array(
                z
                  .object({
                    baseUrl: z.string(),
                    languageCode: z.string(),
                    kind: z.string().optional(),
                    name: z.any().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const continuationResponse = z
  .object({
    onResponseReceivedActions: z.array(z.any()).optional(),
    onResponseReceivedEndpoints: z.array(z.any()).optional(),
    continuationContents: z.any().optional(),
    actions: z.array(z.any()).optional(),
  })
  .passthrough();

export type PlayerResponse = z.infer<typeof playerResponse>;
export type StreamingFormat = z.infer<typeof streamingFormat>;

/** Read a Zod result, throwing a compact error message (no payload dump). */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid ${label} response (${issues})`);
  }
  return result.data;
}
