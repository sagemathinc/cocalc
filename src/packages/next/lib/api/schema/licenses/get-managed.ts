import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";
import { AccountIdSchema } from "../accounts/common";

import {
  SiteLicenseIdSchema,
  SiteLicenseQuotaSchema,
  SiteLicenseRunLimitSchema,
} from "./common";

// OpenAPI spec
//
export const GetManagedLicensesInputSchema = z
  .object({
    limit: z
      .number()
      .min(1)
      .optional()
      .describe("Limits number of results to the provided value."),
    skip: z.number().min(1).optional().describe("Skips the first `n` results."),
  })
  .describe(
    `Fetch all licenses which are managed by a particular \`account_id\`. Results are 
     returned in descending order of license creation time.`,
  );

export const GetManagedLicensesOutputSchema = z.union([
  FailedAPIOperationSchema,
  z
    .object({
      id: SiteLicenseIdSchema,
      title: z.string().optional().describe("User-defined license title."),
      description: z
        .string()
        .optional()
        .describe("User-defined license description."),
      expires: z
        .number()
        .optional()
        .describe(
          "UNIX timestamp (in milliseconds) which indicates when the license is to expire.",
        ),
      activates: z.number().describe(
        `UNIX timestamp (in milliseconds) which indicates when the license takes effect. 
         Licenses may be applied prior to this time, but will not take effect before it.`,
      ),
      last_used: z
        .number()
        .optional()
        .describe(
          `UNIX timestamp (in milliseconds) which indicates when the license was last used 
           to upgrade a project while it started.`,
        ),
      created: z
        .number()
        .optional()
        .describe(
          "UNIX timestamp (in milliseconds) which indicates when the license was created.",
        ),
      managers: z
        .array(AccountIdSchema)
        .describe(
          "A list of account ids which are permitted to manage this license.",
        ),
      upgrades: z
        .object({
          cores: z.number().min(0),
          cpu_shares: z.number().min(0),
          disk_quota: z.number().min(0),
          memory: z.number().min(0),
          mintime: z.number().min(0),
          network: z.number().min(0),
        })
        .optional()
        .describe(
          `**Deprecated:** A map of upgrades that are applied to a project when it has 
          this site license. This is been deprecated in favor of the \`quota\` field.`,
        ),
      quota: SiteLicenseQuotaSchema.optional().describe(
        "The exact resource quota allotted to this license.",
      ),
      run_limit: SiteLicenseRunLimitSchema,
      info: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          `Structured object in which admins may store additional license information. 
           This field generally contains purchase information for the license (e.g., 
           purchasing account, etc.)`,
        ),
    })
    .describe(
      `Defines a site license object, which is used to determine resource limits (e.g., 
       CPU, memory, disk space, etc.) to be applied to a running project.`,
    ),
]);

export type GetManagedLicensesInput = z.infer<
  typeof GetManagedLicensesInputSchema
>;
export type GetManagedLicensesOutput = z.infer<
  typeof GetManagedLicensesOutputSchema
>;
