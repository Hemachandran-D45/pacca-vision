import type { VercelRequest, VercelResponse } from "../server/vercel-types";

/**
 * A deliberately dependency-free probe, to split an opaque platform 500 in two.
 *
 * This file imports nothing but a type, so it cannot fail for any reason the
 * Senderra routes can. Comparing the two answers localises the fault exactly:
 *
 *   /api/ping 200 + /api/senderra/health 500  -> the function boots; the fault
 *                                                is in the Azure SDK or config
 *   both 500                                  -> the runtime itself cannot
 *                                                start (wrong Node version,
 *                                                bad build output, bad routing)
 *
 * It also reports the runtime it is actually running on, which is the fastest
 * way to confirm whether the Node 22 requirement took effect.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    node: process.version,
    region: process.env.VERCEL_REGION ?? null,
    env: process.env.VERCEL_ENV ?? null,
    // Presence only — never the values.
    envPresent: {
      COSMOS_ENDPOINT: Boolean(process.env.COSMOS_ENDPOINT),
      COSMOS_KEY: Boolean(process.env.COSMOS_KEY),
      COSMOS_DATABASE: Boolean(process.env.COSMOS_DATABASE),
      COSMOS_CONTAINER: Boolean(process.env.COSMOS_CONTAINER),
      AZURE_STORAGE_ACCOUNT: Boolean(process.env.AZURE_STORAGE_ACCOUNT),
      AZURE_STORAGE_KEY: Boolean(process.env.AZURE_STORAGE_KEY),
    },
  });
}
