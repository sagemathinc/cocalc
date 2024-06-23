import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ComputeServerCloudSchema, ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const SetComputeServerCloudInputSchema = z
  .object({
    id: ComputeServerIdSchema,
    cloud: ComputeServerCloudSchema,
  })
  .describe(
    `Set the cloud of a compute server.  The owner is the only one allowed to do this.
    Changing the cloud clears the configuration, since it is not meaningful between 
    clouds.`,
  );

export const SetComputeServerCloudOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type SetComputeServerCloudInput = z.infer<
  typeof SetComputeServerCloudInputSchema
>;
export type SetComputeServerCloudOutput = z.infer<
  typeof SetComputeServerCloudOutputSchema
>;
