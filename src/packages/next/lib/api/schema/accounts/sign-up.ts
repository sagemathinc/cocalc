import { SignUpIssues } from "lib/types/sign-up";
import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";

import { AccountIdSchema } from "./common";

// OpenAPI spec — two modes:
// 1. Regular signup: email, password, firstName, lastName, terms required
// 2. Anonymous signup: anonymous=true, all other fields optional
//
const SharedOptionalFields = {
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
  reCaptchaToken: z.string().optional().describe("reCAPTCHA v3 token"),
};

const RegularSignUpSchema = z.object({
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
  anonymous: z.literal(false).optional(),
  ...SharedOptionalFields,
});

const AnonymousSignUpSchema = z.object({
  anonymous: z
    .literal(true)
    .describe("Set to true for anonymous account creation."),
  ...SharedOptionalFields,
});

export const SignUpInputSchema = z
  .union([RegularSignUpSchema, AnonymousSignUpSchema])
  .describe(
    "Create a new account. For regular signup, provide email, password, firstName, lastName, and terms. For anonymous signup, set anonymous=true. In production, API-based account creation requires additional trust. For on-premises, this functionality is only available for administrators.",
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
