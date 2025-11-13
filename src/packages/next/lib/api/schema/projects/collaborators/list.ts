import { z } from "../../../framework";

import { FailedAPIOperationSchema } from "../../common";

import { ProjectIdSchema } from "../common";

export const ProjectCollaboratorSchema = z.object({
  account_id: z.string().uuid(),
  first_name: z.string(),
  last_name: z.string(),
});

export type ProjectCollaborator = z.infer<typeof ProjectCollaboratorSchema>;

// OpenAPI spec
//
export const ListProjectCollaboratorsInputSchema = z
  .object({
    project_id: ProjectIdSchema,
  })
  .describe(
    `List all collaborators on a project. When executed as an administrator, any project 
     may be queried; otherwise, this endpoint only returns collaborators on projects for 
     which the client account is itself a collaborator.`,
  );

export const ListProjectCollaboratorsOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.array(ProjectCollaboratorSchema),
]);

export type ListProjectCollaboratorsInput = z.infer<
  typeof ListProjectCollaboratorsInputSchema
>;
export type ListProjectCollaboratorsOutput = z.infer<
  typeof ListProjectCollaboratorsOutputSchema
>;
