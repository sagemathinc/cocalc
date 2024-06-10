import { z } from "../../framework";

import { FailedAPIOperationSchema, SuccessfulAPIOperationSchema } from "../common";

import { ComputeServerIdBodySchema } from "./common";

// OpenAPI spec
//
export const SetComputeServerImageTestedInputSchema = z
  .object({
    id: ComputeServerIdBodySchema,
    tested: z
      .boolean()
      .describe(
        "Indicates whether the server image specified in the `id` field has been tested."
      ),
  })
  .describe(
    `Set whether or not the image a compute server with given id is using has been tested.
     This is used by admins when manually doing final integration testing for a new image
     on some cloud provider.`
  );

export const SetComputeServerImageTestedOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type SetComputeServerImageTestedInput = z.infer<typeof SetComputeServerImageTestedInputSchema>;
export type SetComputeServerImageTestedOutput = z.infer<typeof SetComputeServerImageTestedOutputSchema>;
