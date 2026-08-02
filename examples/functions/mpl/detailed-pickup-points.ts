import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AdapterContext,
  FetchPickupPointsResponse,
} from "@shopickup/core";
import type { FetchDetailedPickupPointsRequestMPL } from "@shopickup/adapters-mpl/validation";

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.detailed-pickup-points --args examples/functions/fixtures/mpl/detailed-pickup-points.json --full-logs

export const meta = {
  id: "mpl.detailed-pickup-points",
  description: "MPL: fetch detailed pickup points from the public PartnerExtra XML feed",
};

const __dirname = join(fileURLToPath(import.meta.url), "..");

export async function run(
  args: FetchDetailedPickupPointsRequestMPL,
  ctx: { adapterContext: AdapterContext },
) {
  const mod =
    (await import("@shopickup/adapters-mpl")) as typeof import("@shopickup/adapters-mpl");
  const adapter = new mod.MPLAdapter();

  if (typeof adapter.fetchDetailedPickupPoints !== "function") {
    throw new Error("Adapter does not implement fetchDetailedPickupPoints");
  }

  const res = await adapter.fetchDetailedPickupPoints(args, ctx.adapterContext);

  writeFileSync(
    join(__dirname, "detailed-pickup-points-result.json"),
    JSON.stringify(res, null, 2),
    "utf-8",
  );

  return res as FetchPickupPointsResponse;
}
