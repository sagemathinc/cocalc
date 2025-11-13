import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const DeleteComputeServerAPIKeyInputSchema = z
  .object({
    id: ComputeServerIdSchema,
  })
  .describe(
    "Deletes the project API key associated with a particular compute server.",
  );

export const DeleteComputeServerAPIKeyOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type DeleteComputeServerAPIKeyInput = z.infer<
  typeof DeleteComputeServerAPIKeyInputSchema
>;
export type DeleteComputeServerAPIKeyOutput = z.infer<
  typeof DeleteComputeServerAPIKeyOutputSchema
>;
