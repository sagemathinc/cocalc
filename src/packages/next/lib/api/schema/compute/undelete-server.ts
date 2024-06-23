import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const UndeleteComputeServerInputSchema = z
  .object({
    id: ComputeServerIdSchema,
  })
  .describe("Undelete a compute server.");

export const UndeleteComputeServerOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type UndeleteComputeServerInput = z.infer<
  typeof UndeleteComputeServerInputSchema
>;
export type UndeleteComputeServerOutput = z.infer<
  typeof UndeleteComputeServerOutputSchema
>;
