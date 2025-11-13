import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { AdminAccountIdSchema } from "../accounts/common";

import {
  ProjectDescriptionSchema,
  ProjectIdSchema,
  ProjectNameSchema,
  ProjectTitleSchema,
} from "./common";

// OpenAPI spec
//
export const UpdateProjectInputSchema = z
  .object({
    account_id: AdminAccountIdSchema,
    project_id: ProjectIdSchema,
    title: ProjectTitleSchema.optional(),
    description: ProjectDescriptionSchema.optional(),
    name: ProjectNameSchema.optional(),
  })
  .describe(
    `Update an existing project's title, name, and/or description. If the API client is an 
     admin, they may act on any project. Otherwise, the client may only update projects 
     for which they are listed as collaborators.`,
  );

export const UpdateProjectOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;
export type UpdateProjectOutput = z.infer<typeof UpdateProjectOutputSchema>;
