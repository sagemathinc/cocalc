import { z } from "../../framework";

import {
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
} from "../common";

import { ProjectIdSchema } from "./common";

// OpenAPI spec
//
export const SetAdminQuotasInputSchema = z
  .object({
    project_id: ProjectIdSchema.describe("Project id to set quotas for."),
    memory_limit: z
      .number()
      .nonnegative()
      .optional()
      .describe("Memory limit in MB"),
    memory_request: z
      .number()
      .nonnegative()
      .optional()
      .describe("Memory request in MB"),
    cpu_request: z
      .number()
      .nonnegative()
      .optional()
      .describe("CPU request (number of cores)"),
    cpu_limit: z
      .number()
      .nonnegative()
      .optional()
      .describe("CPU limit (number of cores)"),
    disk_quota: z
      .number()
      .nonnegative()
      .optional()
      .describe("Disk quota in MB"),
    idle_timeout: z
      .number()
      .nonnegative()
      .optional()
      .describe("Idle timeout in seconds"),
    internet: z.boolean().optional().describe("Internet access"),
    member_host: z.boolean().optional().describe("Member hosting"),
    always_running: z.boolean().optional().describe("Always running"),
  })
  .describe(
    "**Administrators only**. Used to set project quotas as an admin. Important: you have to stop and start the project after any change.",
  );

export const SetAdminQuotasOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type SetAdminQuotasInput = z.infer<typeof SetAdminQuotasInputSchema>;
export type SetAdminQuotasOutput = z.infer<typeof SetAdminQuotasOutputSchema>;
