import { z } from "../../framework";

import { FailedAPIOperationSchema, MoneyValueSchema } from "../common";

import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const GetComputeServerNetworkUsageInputSchema = z
  .object({
    id: ComputeServerIdSchema,
    start: z
      .string()
      .describe("Time after which network usage is to be queried."),
    end: z
      .string()
      .describe("Time before which network usage is to be queried."),
  })
  .describe(
    "Get network usage by a specific server during a particular period of time.",
  );

export const GetComputeServerNetworkUsageOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    amount: z.number().min(0).describe("Total amount of network usage."),
    cost: MoneyValueSchema.describe("Network usage cost."),
  }),
]);

export type GetComputeServerNetworkUsageInput = z.infer<
  typeof GetComputeServerNetworkUsageInputSchema
>;
export type GetComputeServerNetworkUsageOutput = z.infer<
  typeof GetComputeServerNetworkUsageOutputSchema
>;
