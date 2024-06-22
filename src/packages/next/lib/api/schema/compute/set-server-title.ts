import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ComputeServerIdSchema, ComputeServerTitleSchema } from "./common";

// OpenAPI spec
//
export const SetComputeServerTitleInputSchema = z
  .object({
    id: ComputeServerIdSchema,
    title: ComputeServerTitleSchema,
  })
  .describe(
    "Set the title of a compute server.  The owner is the only one allowed to do this.",
  );

export const SetComputeServerTitleOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type SetComputeServerTitleInput = z.infer<
  typeof SetComputeServerTitleInputSchema
>;
export type SetComputeServerTitleOutput = z.infer<
  typeof SetComputeServerTitleOutputSchema
>;
