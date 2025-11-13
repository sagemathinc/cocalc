import { z } from "../../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../../common";

import { ProjectIdSchema } from "../common";
import { AccountIdSchema } from "../../accounts/common";

// OpenAPI spec
//
export const RemoveProjectCollaboratorInputSchema = z
  .object({
    project_id: ProjectIdSchema,
    account_id: AccountIdSchema,
  })
  .describe("Remove a collaborator from an existing project.");

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
