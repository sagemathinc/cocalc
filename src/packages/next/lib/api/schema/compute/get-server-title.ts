import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import {
  ComputeServerColorSchema,
  ComputeServerIdSchema,
  ComputeServerTitleSchema,
} from "./common";

// OpenAPI spec
//
export const GetComputeServerTitleInputSchema = z
  .object({
    id: ComputeServerIdSchema,
  })
  .describe("Get server title and color for a particular compute server.");

export const GetComputeServerTitleOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    color: ComputeServerColorSchema,
    title: ComputeServerTitleSchema,
  }),
]);

export type GetComputeServerTitleInput = z.infer<
  typeof GetComputeServerTitleInputSchema
>;
export type GetComputeServerTitleOutput = z.infer<
  typeof GetComputeServerTitleOutputSchema
>;
