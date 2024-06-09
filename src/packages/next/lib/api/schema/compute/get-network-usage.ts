import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { ComputeServerIdBodySchema } from "./common";

// OpenAPI spec
//
export const GetComputeServerNetworkUsageInputSchema = z
  .object({
    id: ComputeServerIdBodySchema,
    start: z
      .string()
      .describe("Time after which network usage is to be queried."),
    end: z
      .string()
      .describe("Time before which network usage is to be queried."),
  })
  .describe(
    "Get network usage by a specific server during a particular period of time."
  );

export const GetComputeServerNetworkUsageOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    amount: z
      .number()
      .min(0)
      .describe("Total amount of network usage."),
    cost: z
      .number()
      .min(0)
      .describe("Network usage cost.")
  }),
]);

export type GetComputeServerNetworkUsageInput = z.infer<typeof GetComputeServerNetworkUsageInputSchema>;
export type GetComputeServerNetworkUsageOutput = z.infer<typeof GetComputeServerNetworkUsageOutputSchema>;
