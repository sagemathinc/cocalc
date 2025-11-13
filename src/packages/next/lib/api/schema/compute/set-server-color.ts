import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ComputeServerColorSchema, ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const SetComputeServerColorInputSchema = z
  .object({
    id: ComputeServerIdSchema,
    color: ComputeServerColorSchema,
  })
  .describe("Set the color of a compute server.");

export const SetComputeServerColorOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type SetComputeServerColorInput = z.infer<
  typeof SetComputeServerColorInputSchema
>;
export type SetComputeServerColorOutput = z.infer<
  typeof SetComputeServerColorOutputSchema
>;
