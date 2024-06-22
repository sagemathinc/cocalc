import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ProjectIdSchema } from "../projects/common";

import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const SetDetailedServerStateInputSchema = z
  .object({
    id: ComputeServerIdSchema,
    project_id: ProjectIdSchema,
    name: z
      .string()
      .describe(
        `Optional JSON path to select a particular property of the compute
        server's detailed state.`,
      )
      .optional(),
    state: z
      .string()
      .describe(
        `The value of the state field to be set. If this value is empty, the state variable
        specified in the \`name\` field is removed.`,
      )
      .optional(),
    extra: z.string().describe("State metadata.").optional(),
    timeout: z
      .number()
      .min(0)
      .describe("Specifies a duration for which this state variable is valid.")
      .optional(),
    progress: z.number().optional(),
  })
  .describe(
    `Set detailed state for a compute server; detailed state maps component name to
    something like \`{state:'running',time:Date.now()}\` and is used to provide users with
    insight into what's currently happening on their compute server. The \`name\`
    must be provided to specify a particular (possibly nested) state property to be set.
    _This is mainly used from the backend to convey information to user about what is 
    going on in a compute server._`,
  );

export const SetDetailedServerStateOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type SetDetailedServerStateInput = z.infer<
  typeof SetDetailedServerStateInputSchema
>;
export type SetDetailedServerStateOutput = z.infer<
  typeof SetDetailedServerStateOutputSchema
>;
