import { z } from "../../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../../common";

import { ProjectIdSchema } from "../common";
import { AccountIdSchema } from "../../accounts/common";

// OpenAPI spec
//
export const AddProjectCollaboratorInputSchema = z
  .object({
    project_id: ProjectIdSchema,
    account_id: AccountIdSchema,
  })
  .describe("Add a collaborator to an existing project.");

export const AddProjectCollaboratorOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type AddProjectCollaboratorInput = z.infer<
  typeof AddProjectCollaboratorInputSchema
>;
export type AddProjectCollaboratorOutput = z.infer<
  typeof AddProjectCollaboratorOutputSchema
>;
