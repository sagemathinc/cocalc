import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const DeleteComputeServerInputSchema = z
  .object({
    id: ComputeServerIdSchema,
  })
  .describe("Deletes and deprovisions a compute server.");

export const DeleteComputeServerOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type DeleteComputeServerInput = z.infer<
  typeof DeleteComputeServerInputSchema
>;
export type DeleteComputeServerOutput = z.infer<
  typeof DeleteComputeServerOutputSchema
>;
