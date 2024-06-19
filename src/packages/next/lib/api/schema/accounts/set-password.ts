import { z } from "../../framework";

import {
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
} from "../common";

// OpenAPI spec
//
export const SetAccountPasswordInputSchema = z
  .object({
    currentPassword: z
      .string()
      .describe("The current password for the account."),
    newPassword: z.string().describe("The new password for the account."),
  })
  .describe("Set password for an existing account.");

export const SetAccountPasswordOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type SetAccountPasswordInput = z.infer<
  typeof SetAccountPasswordInputSchema
>;
export type SetAccountPasswordOutput = z.infer<
  typeof SetAccountPasswordOutputSchema
>;
