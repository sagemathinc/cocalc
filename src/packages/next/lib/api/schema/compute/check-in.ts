import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { ComputeServerIdSchema } from "./common";

const VpnSha1Schema = z.string().describe("SHA1 VPN hash").optional();

const StorageSha1Schema = z.string().describe("SHA-1 storage hash").optional();

// OpenAPI spec
//
export const ComputeServerCheckInInputSchema = z
  .object({
    id: ComputeServerIdSchema,
    vpn_sha1: VpnSha1Schema,
    storage_sha1: StorageSha1Schema,
  })
  .describe(
    `Used by compute servers to periodically checking in with CoCalc using a project api 
    key.`,
  );

export const ComputeServerCheckInOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    vpn: z.object({
      image: z.string().describe("VPN image name and tag."),
      nodes: z.array(z.object({})),
    }),
    storage: z.array(z.object({})),
    vpn_sha1: VpnSha1Schema,
    storage_sha1: StorageSha1Schema,
  }),
]);

export type ComputeServerCheckInInput = z.infer<
  typeof ComputeServerCheckInInputSchema
>;
export type ComputeServerCheckInOutput = z.infer<
  typeof ComputeServerCheckInOutputSchema
>;
