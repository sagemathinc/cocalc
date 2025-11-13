import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { AccountIdSchema } from "./common";
import { RequestNoCacheSchema } from "../common";

// OpenAPI spec
//
export const AccountProfileInputSchema = z
  .object({
    account_id: AccountIdSchema.optional(),
    noCache: RequestNoCacheSchema.optional(),
  })
  .describe(
    `Get the *public* profile for a given account or the private profile of the user 
     making the request. This is public information if user the user knows the account_id. 
     It is the color, the name, and the image.`,
  );

export const AccountProfileOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    profile: z
      .object({
        account_id: AccountIdSchema,
        first_name: z.string().describe("First name of account holder."),
        last_name: z.string().describe("Last name of account holder."),
        image: z
          .string()
          .describe(
            `Account avatar image. This value may be used directly in the \`src\` 
             attribute of an HTML \`image\` tag`,
          )
          .optional(),
        color: z
          .string()
          .describe(
            `Background color for account avatar if an image is not provided.`,
          )
          .optional(),
        name: z
          .union([z.string().describe("Account username"), z.null()])
          .describe(
            `Account username. This is used to provide a nice URL for public content 
             associated with this account.`,
          ),
        is_admin: z
          .boolean()
          .describe("_Included when the full profile is returned.")
          .optional(),
        is_partner: z
          .boolean()
          .describe("_Included when the full profile is returned.")
          .optional(),
        is_anonymous: z
          .boolean()
          .describe("_Included when the full profile is returned.")
          .optional(),
        email_address: z.string().describe("The account e-mail address."),
      })
      .describe("An object containing account profile information."),
  }),
]);

export type AccountProfileInput = z.infer<typeof AccountProfileInputSchema>;
export type AccountProfileOutput = z.infer<typeof AccountProfileOutputSchema>;
