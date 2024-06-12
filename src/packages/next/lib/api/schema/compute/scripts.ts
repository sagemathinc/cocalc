import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const ComputeServerScriptsInputSchema = z
  .object({
    id: ComputeServerIdSchema,
    api_key: z
      .string()
      .describe("Used to get the project associated with the compute server. "),
    action: z
      .enum(["start", "stop", "deprovision"])
      .describe(
        "Determines which script is to be returned from this API call.",
      ),
  })
  .describe(
    `Returns a bash script that when run as root starts a compute server and 
    connects it to a project. This is meant to be used for on prem compute 
    servers, hence it includes installing the \`/cocalc\` code and the 
    \`user\` user.`,
  );

export const ComputeServerScriptsOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.string().describe("The script of interest."),
]);

export type ComputeServerScriptsInput = z.infer<
  typeof ComputeServerScriptsInputSchema
>;
export type ComputeServerScriptsOutput = z.infer<
  typeof ComputeServerScriptsOutputSchema
>;
