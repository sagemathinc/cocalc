import { z } from "../../framework";

import { FailedAPIOperationSchema, SuccessfulAPIOperationSchema } from "../common";

import { ComputeServerIdBodySchema } from "./common";

// OpenAPI spec
//
export const UndeleteComputeServerInputSchema = z
  .object({
    id: ComputeServerIdBodySchema,
  })
  .describe("Undelete a compute server.");

export const UndeleteComputeServerOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type UndeleteComputeServerInput = z.infer<typeof UndeleteComputeServerInputSchema>;
export type UndeleteComputeServerOutput = z.infer<typeof UndeleteComputeServerOutputSchema>;
