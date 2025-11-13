import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { ProjectIdSchema } from "../projects/common";

import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const GetDetailedServerStateInputSchema = z
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
  })
  .describe(
    `Returns a map from component name to something like \`{state:'running',time:Date.now()}\`.
    This is used to provide users with insight into what's currently happening on their 
    compute server. The response may optionally be filtered via a JSON path specified in 
    the \`name\` attribute to obtain a particular (possibly nested) state property.`,
  );

export const GetDetailedServerStateOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.string().describe(
    `When the \`name\` field is not specified, the entire server state is returned as a
      string; otherwise, only the subset of the server state corresponding to the JSON 
      path specified in \`name\` is returned.`,
  ),
]);

export type GetDetailedServerStateInput = z.infer<
  typeof GetDetailedServerStateInputSchema
>;
export type GetDetailedServerStateOutput = z.infer<
  typeof GetDetailedServerStateOutputSchema
>;
