import { createServerFn } from "@tanstack/react-start";

/**
 * The Google Maps Platform key for Photorealistic 3D Tiles, from the
 * GOOGLE_MAPS_API_KEY secret, or null when none is set (the game then shows
 * only its own city).
 *
 * The tiles are fetched by the browser, so this key is public by design:
 * restrict it in Google Cloud to the Map Tiles API and to this site's
 * HTTP referrers. Never put a key with wider access here.
 */
export const getMapsKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ key: string | null }> => ({
    key: process.env.GOOGLE_MAPS_API_KEY?.trim() || null,
  }),
);
