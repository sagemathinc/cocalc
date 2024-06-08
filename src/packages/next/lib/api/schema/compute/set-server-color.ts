import { z } from "../../framework";

import { FailedAPIOperationSchema, SuccessfulAPIOperationSchema } from "../common";

import {
  ComputeServerColorSchema,
  ComputeServerIdBodySchema
} from "./common";

// OpenAPI spec
//
export const SetComputeServerColorInputSchema = z
  .object({
    id: ComputeServerIdBodySchema,
    color: ComputeServerColorSchema,
  })
  .describe("Set the color of a compute server.");

export const SetComputeServerColorOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type SetComputeServerColorInput = z.infer<typeof SetComputeServerColorInputSchema>;
export type SetComputeServerColorOutput = z.infer<typeof SetComputeServerColorOutputSchema>;
