import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";
import { AccountUserSchema } from "./common";

// OpenAPI spec
//
export const AccountSearchInputSchema = z
  .object({
    query: z.string()
      .describe(`Comma- or space-delimited list of account e-mail addresses, account ids, 
      and/or first/last names to query for an account by.`),
  })
  .describe(
    `Search for accounts matching a given query. If user is signed in, then their 
      account id is used to prioritize the search.`,
  );

export const AccountSearchOutputSchema = z.union([
  FailedAPIOperationSchema,
  z
    .array(AccountUserSchema)
    .describe(
      "List of matching accounts, sorted by last active and/or account creation date.",
    ),
]);

export type AccountSearchInput = z.infer<typeof AccountSearchInputSchema>;
export type AccountSearchOutput = z.infer<typeof AccountSearchOutputSchema>;
