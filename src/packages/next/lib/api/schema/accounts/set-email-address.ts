import { z } from "../../framework";

import {
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
} from "../common";

import { AccountEmailSchema } from "./common";

// OpenAPI spec
//
export const SetAccountEmailAddressInputSchema = z
  .object({
    email_address: AccountEmailSchema,
    password: z.string().describe("The password for the account."),
  })
  .describe(
    `Set email address of an account. The password must also be provided. If the 
     email address is already set in the database, then \`password\` must be the current 
     correct password. If the email address is NOT set, then a new email address and 
     password are set.`,
  );

export const SetAccountEmailAddressOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type SetAccountEmailAddressInput = z.infer<
  typeof SetAccountEmailAddressInputSchema
>;
export type SetAccountEmailAddressOutput = z.infer<
  typeof SetAccountEmailAddressOutputSchema
>;
