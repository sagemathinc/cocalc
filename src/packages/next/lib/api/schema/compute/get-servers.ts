import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { ProjectIdSchema } from "../projects/common";

import {
  ComputeServerIdBodySchema,
  ComputeServerIdQueryParamSchema,
  ComputeServerTitleSchema,
} from "./common";

// OpenAPI spec
//
export const GetComputeServersInputSchema = z
  .object({
    id: ComputeServerIdQueryParamSchema.optional(),
    project_id: ProjectIdSchema.optional(),
  })
  .describe("Parameters that restrict compute servers to get.");


export const GetComputeServersOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.array(z.object({
    id: ComputeServerIdBodySchema,
    title: ComputeServerTitleSchema,
  })),
]);

export type GetComputeServersInput = z.infer<typeof GetComputeServersInputSchema>;
export type GetComputeServersOutput = z.infer<typeof GetComputeServersOutputSchema>;
