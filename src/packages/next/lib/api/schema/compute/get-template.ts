import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import {
  BaseServerConfigurationSchema,
  ComputeServerCloudSchema,
  ComputeServerColorSchema,
  ComputeServerIdSchema,
  ComputeServerTitleSchema,
} from "./common";

// OpenAPI spec
//
export const ComputeServerTemplateObjectSchema = z
  .object({
    enabled: z
      .boolean()
      .describe(
        "If true, this server template is to be shown in the CoCalc UI.",
      )
      .optional(),
    priority: z
      .number()
      .describe("Semantic priority for this server template.")
      .optional(),
  })
  .describe(
    "Contains information about this template's priority and availability.",
  );

export const GetComputeServerTemplateSchema = z.object({
  id: ComputeServerIdSchema.describe("Compute server template id"),
  title: ComputeServerTitleSchema,
  color: ComputeServerColorSchema,
  cloud: ComputeServerCloudSchema,
  configuration:
    BaseServerConfigurationSchema.describe(`Default cloud server configuration for this template. _The exact
            structure of this object is still in development, and this schema should
            be used accordingly.`),
  template: ComputeServerTemplateObjectSchema,
  avatar_image_tiny: z
    .union([z.string().describe("Image URL"), z.null()])
    .describe(
      `tiny (32x32) visual image associated with the compute server. Suitable to 
            include as part of changefeed`,
    ),
  position: z
    .number()
    .int()
    .describe("Used for sorting a list of compute servers in the UI."),
  cost_per_hour: z
    .object({
      running: z
        .number()
        .describe(
          "Cost in (fractional) cents for the compute server when powered on.",
        ),
      off: z
        .number()
        .describe(
          "Cost in (fractional) cents for the compute server when powered off.",
        ),
    })
    .describe("Compute server template.")
    .optional(),
});

export const GetComputeServerTemplateInputSchema = z
  .object({
    id: ComputeServerIdSchema.describe("Compute server template id."),
  })
  .describe("Get a specific compute server template by `id`.");

export const GetComputeServerTemplateOutputSchema = z.union([
  FailedAPIOperationSchema,
  GetComputeServerTemplateSchema,
]);

export type GetComputeServerTemplateInput = z.infer<
  typeof GetComputeServerTemplateInputSchema
>;
export type GetComputeServerTemplateOutput = z.infer<
  typeof GetComputeServerTemplateOutputSchema
>;
