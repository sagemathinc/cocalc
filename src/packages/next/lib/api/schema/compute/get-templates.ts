import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { GetComputeServerTemplateSchema } from "./get-template";

// OpenAPI spec
//
export const GetComputeServerTemplatesOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    templates: z.array(GetComputeServerTemplateSchema),
  })
    .describe("Default compute server templates."),
]);

export type GetComputeServerTemplatesOutput = z.infer<typeof GetComputeServerTemplatesOutputSchema>;
