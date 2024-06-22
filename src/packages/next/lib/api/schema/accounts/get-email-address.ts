import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { AccountEmailSchema, AccountIdSchema } from "./common";

// OpenAPI spec
//
export const GetAccountEmailAddressInputSchema = z
  .object({
    account_id: AccountIdSchema,
  })
  .describe(
    `**Administrators only**. Used to fetch the e-mail address associated with an
      account id.`,
  );

export const GetAccountEmailAddressOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    email_address: AccountEmailSchema,
  }),
]);

export type GetAccountEmailAddressInput = z.infer<
  typeof GetAccountEmailAddressInputSchema
>;
export type GetAccountEmailAddressOutput = z.infer<
  typeof GetAccountEmailAddressOutputSchema
>;
