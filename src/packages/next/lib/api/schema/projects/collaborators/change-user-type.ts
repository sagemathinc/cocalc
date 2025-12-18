import { z } from "../../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../../common";

import { ProjectIdSchema } from "../common";
import { AccountIdSchema } from "../../accounts/common";

export const UserGroupSchema = z
  .enum(["owner", "collaborator"])
  .describe("Project user role (owner or collaborator).");

export const ChangeProjectUserTypeInputSchema = z
  .object({
    project_id: ProjectIdSchema,
    target_account_id: AccountIdSchema.describe(
      "Account id of the user whose role will be changed.",
    ),
    new_group: UserGroupSchema.describe(
      "New role to assign; must be owner or collaborator.",
    ),
  })
  .describe(
    "Change a collaborator's role in a project. Only owners can promote or demote users; validation enforces ownership rules (e.g., cannot demote the last owner).",
  );

export const ChangeProjectUserTypeOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type ChangeProjectUserTypeInput = z.infer<
  typeof ChangeProjectUserTypeInputSchema
>;
export type ChangeProjectUserTypeOutput = z.infer<
  typeof ChangeProjectUserTypeOutputSchema
>;
