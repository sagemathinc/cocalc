import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { AdminAccountIdSchema } from "../accounts/common";

import { ProjectIdSchema } from "./common";

// OpenAPI spec
//
export const GetAccountProjectsInputSchema = z
  .object({
    account_id: AdminAccountIdSchema,
    limit: z
      .number()
      .default(50)
      .describe("Upper bound on the number of projects to return.")
      .nullish(),
  })
  .describe("Gets projects for a particular account.");

export const GetAccountProjectsOutputSchema = z.union([
  FailedAPIOperationSchema,
  z
    .array(
      z.object({
        project_id: ProjectIdSchema,
        title: ProjectIdSchema,
      }),
    )
    .describe("An array of projects corresponding to a particular account."),
]);

export type GetAccountProjectsInput = z.infer<
  typeof GetAccountProjectsInputSchema
>;
export type GetAccountProjectsOutput = z.infer<
  typeof GetAccountProjectsOutputSchema
>;
