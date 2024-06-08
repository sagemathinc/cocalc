import { z } from "../../framework";

import { FailedAPIOperationSchema, SuccessfulAPIOperationSchema } from "../common";

import { ComputeServerIdBodySchema } from "./common";

// OpenAPI spec
//
export const DeleteComputeServerAPIKeyInputSchema = z
  .object({
    id: ComputeServerIdBodySchema,
  })
  .describe(
    "Deletes the project API key associated with a particular compute server."
  );

export const DeleteComputeServerAPIKeyOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type DeleteComputeServerAPIKeyInput = z.infer<typeof DeleteComputeServerAPIKeyInputSchema>;
export type DeleteComputeServerAPIKeyOutput = z.infer<typeof DeleteComputeServerAPIKeyOutputSchema>;
