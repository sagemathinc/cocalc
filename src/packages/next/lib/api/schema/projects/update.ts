import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ProjectIdSchema } from "./common";

// OpenAPI spec
//
export const UpdateProjectInputSchema = z
  .object({
    project_id: ProjectIdSchema,
    title: z
      .string()
      .describe(
        `The short title of the project. Should use no special formatting, except 
         hashtags.`,
      )
      .optional(),
    description: z
      .string()
      .describe(
        `A longer textual description of the project. This can include hashtags and should 
         be formatted using markdown.`,
      )
      .optional(),
    name: z
      .string()
      .describe(
        `The optional name of this project. Must be globally unique (up to case) across 
         all projects with a given *owner*. It can be between 1 and 100 characters from 
         a-z A-Z 0-9 period and dash.`,
      )
      .optional(),
  })
  .describe(
    `Update an existing project's title, name, and/or description. If the API client is an 
     admin, they may act on any project. Otherwise, the client may only update projects 
     for which they are listed as owners.`,
  );

export const UpdateProjectOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;
export type UpdateProjectOutput = z.infer<typeof UpdateProjectOutputSchema>;
