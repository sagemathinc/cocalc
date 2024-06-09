import { z } from "../../framework";

import { FailedAPIOperationSchema, SuccessfulAPIOperationSchema } from "../common";

import {
  ComputeServerIdBodySchema,
  GoogleCloudServerConfigurationSchema,
  HyperstackServerConfigurationSchema,
} from "./common";

// OpenAPI spec
//
export const SetServerConfigurationInputSchema = z
  .object({
    id: ComputeServerIdBodySchema,
    configuration: z
      .union([
        GoogleCloudServerConfigurationSchema.partial(),
        HyperstackServerConfigurationSchema.partial(),
      ])
      .describe(
        `Server configuration to change. Note that only a subset of the 
        configuration is necessary so that configuration fields may be individually
        changed.`
      ),
  })
  .describe(
    "Create a new compute server with the provided configuration."
  );

export const SetServerConfigurationOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type SetServerConfigurationInput = z.infer<typeof SetServerConfigurationInputSchema>;
export type SetServerConfigurationOutput = z.infer<typeof SetServerConfigurationOutputSchema>;
