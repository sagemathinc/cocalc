import { z } from "../../framework";

import {
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
} from "../common";

import { AccountIdSchema } from "./common";

// OpenAPI spec
//
export const BanAccountInputSchema = z
  .object({
    account_id: AccountIdSchema.describe("Account id to ban."),
  })
  .describe(
    "**Administrators only**. Used to ban a user's account from the system.",
  );

export const BanAccountOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type BanAccountInput = z.infer<typeof BanAccountInputSchema>;
export type BanAccountOutput = z.infer<typeof BanAccountOutputSchema>;
