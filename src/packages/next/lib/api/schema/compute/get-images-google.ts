import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { RequestNoCacheSchema } from "../common";

// OpenAPI spec
//
export const GetComputeServerGoogleImagesInputSchema = z
  .object({
    noCache: RequestNoCacheSchema.optional(),
  })
  .describe(
    "Used to get available compute server images for deployment to GCP.",
  );

export const GetComputeServerGoogleImagesOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.record(
    z.string().describe("Image name"),
    z
      .object({
        labels: z
          .object({
            image: z.string().describe("CoCalc image name"),
            tag: z.string().describe("Image tag"),
            arch: z.enum(["x86-64", "arm64"]).describe("Image architecture"),
            tested: z.string().describe("`true` if the image has been tested."),
          })
          .describe(
            "Map of server image labels to values (e.g. architecture, etc.)",
          ),
        diskSizeGb: z.number().min(0).describe("Disk size in GB"),
        creationTimestamp: z
          .string()
          .describe("ISO 8601 timestamp indicating image creation time."),
      })
      .describe(
        `Map of server image keys to detailed JSON information about the server image (e.g.,
      image architecture, disk size, etc.`,
      ),
  ),
]);

export type GetComputeServerGoogleImagesInput = z.infer<
  typeof GetComputeServerGoogleImagesInputSchema
>;
export type GetComputeServerGoogleImagesOutput = z.infer<
  typeof GetComputeServerGoogleImagesOutputSchema
>;
