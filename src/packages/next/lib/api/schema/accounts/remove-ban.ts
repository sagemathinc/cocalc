import { z } from "../../framework";

import {
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
} from "../common";

import { AccountIdSchema } from "./common";

// OpenAPI spec
//
export const RemoveAccountBanInputSchema = z
  .object({
    account_id: AccountIdSchema.describe("Account id to remove ban for."),
  })
  .describe(
    "**Administrators only**. Used to remove an existing ban on a user's account",
  );

export const RemoveAccountBanOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type RemoveAccountBanInput = z.infer<typeof RemoveAccountBanInputSchema>;
export type RemoveAccountBanOutput = z.infer<
  typeof RemoveAccountBanOutputSchema
>;
