import { SignUpIssues } from "lib/types/sign-up";
import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { AccountIdSchema } from "./common";

// OpenAPI spec
//
export const SignUpInputSchema = z
  .object({
    email: z
      .string()
      .email()
      .describe(
        "Email address of new user. TIP: If you want to pass in an email like jd+1@example.com, use '%2B' in place of '+'",
      ),
    password: z.string().describe("Initial password of new user."),
    firstName: z.string().describe("First name"),
    lastName: z.string().describe("Last name"),
    terms: z
      .boolean()
      .describe("Must be set to 'true' to indicate acceptance of ToS."),
    registrationToken: z
      .string()
      .optional()
      .describe("If required, enter a currently valid registration token."),
    tags: z.array(z.string()).optional().describe("Tag users"),
    publicPathId: z
      .string()
      .optional()
      .describe("ID of published document, used to get a license ID"),
    signupReason: z.string().optional(),
  })
  .describe(
    "Create a new account. In production, this is not available for all users and requires additional trust! For on-premises, this functionality is only available for administrators.",
  );

const IssuesSchema = z.object({
  terms: z.string().optional().describe("Problem with ToS"),
  email: z.string().optional().describe("Problem with the email address"),
  password: z.string().optional().describe("Problem with the password"),
  api: z.string().optional().describe("Problem with the API"),
});

export const SignUpOutputSchema = z.union([
  z.union([
    z.object({
      account_id: AccountIdSchema.describe("Account ID"),
    }),
    z
      .object({
        issues: IssuesSchema,
      })
      .describe("Reporting back possible issues creating a new account."),
  ]),
  FailedAPIOperationSchema,
]);

export type SignUpInput = z.infer<typeof SignUpInputSchema>;
export type SignUpOutput = z.infer<typeof SignUpOutputSchema>;

// consistency check
export const _1: Required<SignUpIssues> = {} as Required<
  z.infer<typeof IssuesSchema>
>;
