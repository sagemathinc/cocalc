import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ComputeServerIdSchema } from "./common";
import { ComputeServerTemplateObjectSchema } from "./get-template";

// OpenAPI spec
//
export const SetComputeServerTemplateInputSchema = z
  .object({
    id: ComputeServerIdSchema.describe("Compute server template id."),
    template: ComputeServerTemplateObjectSchema,
  })
  .describe(
    "**Administrators only**. Set a specific compute server template by `id`.",
  );

export const SetComputeServerTemplateOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type SetComputeServerTemplateInput = z.infer<
  typeof SetComputeServerTemplateInputSchema
>;
export type SetComputeServerTemplateOutput = z.infer<
  typeof SetComputeServerTemplateOutputSchema
>;
