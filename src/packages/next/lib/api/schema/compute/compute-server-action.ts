import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const ComputeServerActionInputSchema = z
  .object({
    id: ComputeServerIdSchema,
    action: z
      .enum(["start", "stop", "reboot", "suspend", "resume", "deprovision"])
      .describe("Action to be performed on the compute server."),
  })
  .describe(
    `Perform various actions on a specific compute server (e.g., power off, deprovision, 
     etc.).`,
  );

export const ComputeServerActionOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    result: z
      .array(z.string())
      .describe(
        "List of likely guesses for the type of code, from most likely to less likely.",
      ),
  }),
]);

export type ComputeServerActionInput = z.infer<
  typeof ComputeServerActionInputSchema
>;
export type ComputeServerActionOutput = z.infer<
  typeof ComputeServerActionOutputSchema
>;
