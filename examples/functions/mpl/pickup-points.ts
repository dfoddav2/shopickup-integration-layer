import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AdapterContext,
  FetchPickupPointsResponse,
} from "@shopickup/core";
import type { FetchPickupPointsRequestMPL } from "@shopickup/adapters-mpl/validation";

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.pickup-points --args examples/functions/fixtures/mpl/pickup-points.json --exchange-first --full-logs

export const meta = {
  id: "mpl.pickup-points",
  description: "MPL: fetch pickup points",
};

const __dirname = join(fileURLToPath(import.meta.url), "..");

export async function run(
  args: FetchPickupPointsRequestMPL,
  ctx: { adapterContext: AdapterContext },
) {
  const mod =
    (await import("@shopickup/adapters-mpl")) as typeof import("@shopickup/adapters-mpl");
  const adapter = new mod.MPLAdapter();

  if (typeof adapter.fetchPickupPoints !== "function") {
    throw new Error("Adapter does not implement fetchPickupPoints");
  }

  const res = await adapter.fetchPickupPoints(args, ctx.adapterContext);

  writeFileSync(
    join(__dirname, "pickup-points-result.json"),
    JSON.stringify(res, null, 2),
    "utf-8",
  );

  return res as FetchPickupPointsResponse;
}
