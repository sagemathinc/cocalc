import { z } from "../../framework";

import {
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
} from "../common";

import { AccountEmailSchema } from "./common";

// OpenAPI spec
//
export const SendAccountVerificationEmailInputSchema = z
  .object({
    email_address: AccountEmailSchema,
  })
  .describe("Send account verification email.");

export const SendAccountVerificationEmailOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type SendAccountVerificationEmailInput = z.infer<
  typeof SendAccountVerificationEmailInputSchema
>;
export type SendAccountVerificationEmailOutput = z.infer<
  typeof SendAccountVerificationEmailOutputSchema
>;
