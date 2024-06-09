import { z } from "../../framework";

import { FailedAPIOperationSchema, SuccessfulAPIOperationSchema } from "../common";

import { ComputeServerIdBodySchema } from "./common";

// OpenAPI spec
//
export const DeleteComputeServerInputSchema = z
  .object({
    id: ComputeServerIdBodySchema,
  })
  .describe(
    "Deletes and deprovisions a compute server."
  );

export const DeleteComputeServerOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type DeleteComputeServerInput = z.infer<typeof DeleteComputeServerInputSchema>;
export type DeleteComputeServerOutput = z.infer<typeof DeleteComputeServerOutputSchema>;
