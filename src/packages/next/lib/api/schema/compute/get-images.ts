import { z } from "../../framework";

import { FailedAPIOperationSchema, RequestNoCacheSchema } from "../common";

import { ComputeServerImageProxySchema } from "./common";

// OpenAPI spec
//
export const GetComputeServerImagesInputSchema = z
  .object({
    noCache: RequestNoCacheSchema.optional(),
  })
  .describe("Used to get available compute server images.");

export const GetComputeServerImagesOutputSchema = z.union([
  FailedAPIOperationSchema,
  z
    .record(
      z.string(),
      z.object({
        system: z.boolean().describe("").optional(),
        priority: z.number().min(0).describe("").optional(),
        disabled: z.boolean().describe("").optional(),
        label: z.string().describe("").optional(),
        comment: z.string().describe("").optional(),
        package: z.string().describe("").optional(),
        package_arm64: z.string().describe("").optional(),
        minDiskSizeGb: z.number().min(0).describe("").optional(),
        dockerSizeGb: z.number().min(0).describe("").optional(),
        gpu: z.boolean().describe("").optional(),
        icon: z.string().describe("").optional(),
        url: z.string().describe("").optional(),
        source: z.string().describe("").optional(),
        description: z.string().describe("").optional(),
        versions: z
          .array(
            z.object({
              tag: z.string(),
              tested: z.boolean(),
              version: z.string().optional(),
              label: z.string().optional(),
            }),
          )
          .optional(),
        videos: z.array(z.string()).optional(),
        tutorials: z.array(z.string()).optional(),
        jupyterKernels: z.boolean().optional(),
        requireDns: z.boolean().optional(),
        upstreamVersions: z.string().optional(),
        proxy: ComputeServerImageProxySchema.optional(),
      }),
    )
    .describe(
      `Maps server image keys to detailed JSON information about the server image (e.g.,
      download URL, descriptions, source files, etc.`,
    ),
]);

export type GetComputeServerImagesInput = z.infer<
  typeof GetComputeServerImagesInputSchema
>;
export type GetComputeServerImagesOutput = z.infer<
  typeof GetComputeServerImagesOutputSchema
>;
