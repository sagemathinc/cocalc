import { z } from "../../framework";

export const AccountIdSchema = z.string().uuid().describe("Account id.");

export type AccountId = z.infer<typeof AccountIdSchema>;

export const AdminAccountIdSchema = AccountIdSchema.optional().describe(
  `**Administrators only**. Optional account id to set name(s) for. If this field is 
     not provided, it is assumed that this operation pertains to the account id of the 
     user making the request.`,
);

export type AdminAccountId = z.infer<typeof AdminAccountIdSchema>;

export const AccountEmailSchema = z
  .string()
  .describe("The account e-mail address.");

export type AccountEmail = z.infer<typeof AccountEmailSchema>;

export const AccountUserSchema = z
  .object({
    account_id: AccountIdSchema,
    first_name: z.string().describe("User's first name.").nullish(),
    last_name: z.string().describe("User's last name.").nullish(),
    name: z.string().describe("Customizable username").nullish(),
    last_active: z
      .number()
      .min(0)
      .nullable()
      .describe(
        "UNIX timestamp indicating time at which the account was last active.",
      ),
    created: z
      .number()
      .min(0)
      .describe(
        "UNIX timestamp indicating time at which the account was created.",
      ),
    banned: z
      .boolean()
      .optional()
      .describe("**Administrators only**. True if this user has been banned."),
    email_address_verified: z
      .boolean()
      .nullish()
      .describe("Set to `true` once the user's e-mail has been verified."),
    email_address: AccountEmailSchema.optional().describe(
      `The account e-mail address. 
      
       *Note*: For security reasons, the email_address *only* occurs in search queries 
       that are by \`email_address\` (or for admins); email addresses of users queried 
       by substring searches are not revealed.`,
    ),
  })
  .describe("User account.");

export type AccountUser = z.infer<typeof AccountUserSchema>;
