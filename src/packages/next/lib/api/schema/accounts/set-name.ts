import { z } from "../../framework";

import {
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
} from "../common";

import { AccountIdSchema } from "./common";

// OpenAPI spec
//
export const SetAccountNameInputSchema = z
  .object({
    account_id: AccountIdSchema.optional().describe(
      `**Administrators only**. Optional account id to set name(s) for. If this field is 
       not provided, it is assumed that this operation pertains to the account id of the 
       user making the request.`,
    ),
    username: z.string().describe("Unique username.").optional(),
    first_name: z.string().max(254).describe("First name").optional(),
    last_name: z.string().max(254).describe("Last name").optional(),
  })
  .describe(
    `Set the username, first name, and/or last name for a user account. Only non-empty
     field values are allowed; everything else will be omitted from the update query.`,
  );

export const SetAccountNameOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type SetAccountNameInput = z.infer<typeof SetAccountNameInputSchema>;
export type SetAccountNameOutput = z.infer<typeof SetAccountNameOutputSchema>;
