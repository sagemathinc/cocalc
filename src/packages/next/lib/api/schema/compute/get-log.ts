import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { ProjectIdSchema } from "../projects/common";
import { AccountIdSchema } from "../accounts/common";

import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const GetComputeServerLogInputSchema = z
  .object({
    id: ComputeServerIdSchema,
  })
  .describe("Get event log for a particular compute server.");

export const GetComputeServerLogOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.array(
    z
      .object({
        account_id: AccountIdSchema,
        project_id: ProjectIdSchema,
        id: z.string().uuid().describe("Event id."),
        time: z.string().describe("ISO 8601 event timestamp."),
        event: z
          .object({
            server_id: ComputeServerIdSchema,
            event: z.string().describe("Event name (e.g., `compute-server`"),
            action: z.string().describe("Event action (e.g., `configuration`"),
            changes: z
              .record(
                z.string(),
                z.object({
                  to: z.any().describe("Previous state."),
                  from: z.any().describe("New state."),
                }),
              )
              .describe("Changes made to the compute server."),
          })
          .describe("Detailed event data."),
      })
      .describe("A list of compute server events."),
  ),
]);

export type GetComputeServerLogInput = z.infer<
  typeof GetComputeServerLogInputSchema
>;
export type GetComputeServerLogOutput = z.infer<
  typeof GetComputeServerLogOutputSchema
>;
