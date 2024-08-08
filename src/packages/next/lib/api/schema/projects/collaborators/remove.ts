import { z } from "../../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../../common";

import { ProjectIdSchema } from "../common";

// OpenAPI spec
//
export const RemoveProjectCollaboratorInputSchema = z
  .object({
    project_id: ProjectIdSchema,
  })
  .describe("Remove a collaborator from a project.");

export const RemoveProjectCollaboratorOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type RemoveProjectCollaboratorInput = z.infer<
  typeof RemoveProjectCollaboratorInputSchema
>;
export type RemoveProjectCollaboratorOutput = z.infer<
  typeof RemoveProjectCollaboratorOutputSchema
>;
