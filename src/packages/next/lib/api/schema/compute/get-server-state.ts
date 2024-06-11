import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { ComputeServerIdSchema, ComputeServerStateSchema } from "./common";

// OpenAPI spec
//
export const GetComputeServerStateInputSchema = z
  .object({
    id: ComputeServerIdSchema,
  })
  .describe(
    "Get server state from the cloud provider for a particular compute server.",
  );

export const GetComputeServerStateOutputSchema = z.union([
  FailedAPIOperationSchema,
  ComputeServerStateSchema,
]);

export type GetComputeServerStateInput = z.infer<
  typeof GetComputeServerStateInputSchema
>;
export type GetComputeServerStateOutput = z.infer<
  typeof GetComputeServerStateOutputSchema
>;
