import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { ComputeServerIdBodySchema } from "./common";

// OpenAPI spec
//
export const GetComputeServerAPIKeyInputSchema = z
  .object({
    id: ComputeServerIdBodySchema,
  })
  .describe(
    `Gets the api key of the compute server. This operation always invalidates 
    any existing key for this server and creates a new one. Only allowed for on-prem 
    servers.`
  );

export const GetComputeServerAPIKeyOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.string().describe("API key for the compute server."),
]);

export type GetComputeServerAPIKeyInput = z.infer<typeof GetComputeServerAPIKeyInputSchema>;
export type GetComputeServerAPIKeyOutput = z.infer<typeof GetComputeServerAPIKeyOutputSchema>;
