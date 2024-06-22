import { z } from "../../framework";

import {
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
} from "../common";

// OpenAPI spec
//
export const AccountSignOutInputSchema = z
  .object({
    all: z
      .boolean()
      .nullable()
      .describe("If `true`, all sessions for the user will be signed out."),
  })
  .describe(
    `Sign out of the current session or all sessions. This invalidates 1 or more "Remember 
     Me" cookies for the account that is making the API request.`,
  );

export const AccountSignOutOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type AccountSignOutInput = z.infer<typeof AccountSignOutInputSchema>;
export type AccountSignOutOutput = z.infer<typeof AccountSignOutOutputSchema>;
