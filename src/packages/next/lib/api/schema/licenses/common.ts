/* See src/packages/util/db-schema/site-licenses.ts for the database schema corresponding
   to this type.
 */

import { z } from "../../framework";

export const SiteLicenseIdSchema = z
  .string()
  .uuid()
  .describe("Site license id.");

export const SiteLicenseIdleTimeoutSchema = z
  .enum(["short", "medium", "day"])
  .describe("Available options for finite project idle run times.");

export const SiteLicenseUptimeSchema = z
  .union([SiteLicenseIdleTimeoutSchema, z.literal("always_running")])
  .describe(
    `Determines how long a project runs while not being used before being automatically
     stopped. A \`short\` value corresponds to a 30-minute timeout, and a \`medium\` value
     to a 2-hour timeout.`,
  );

export const SiteLicenseRunLimitSchema = z
  .number()
  .min(0)
  .describe("Number of projects which may simultaneously use this license");

export const SiteLicenseQuotaSchema = z.object({
  always_running: z
    .boolean()
    .optional()
    .describe(
      `Indicates whether the project(s) this license is applied to should be
       allowed to always be running.`,
    ),
  boost: z
    .boolean()
    .optional()
    .describe(
      `If \`true\`, this license is a boost license and allows for a project to
       temporarily boost the amount of resources available to a project by the amount
       specified in the \`cpu\`, \`memory\`, and \`disk\` fields.`,
    ),
  cpu: z
    .number()
    .min(1)
    .describe("Limits the total number of vCPUs allocated to a project."),
  dedicated_cpu: z.number().min(1).nullish(),
  dedicated_ram: z.number().min(1).nullish(),
  disk: z
    .number()
    .min(1)
    .describe(
      `Disk size in GB to be allocated to the project to which this license is
       applied.`,
    ),
  idle_timeout: SiteLicenseIdleTimeoutSchema.nullish(),
  member: z.boolean().describe(
    `Member hosting significantly reduces competition for resources, and we
     prioritize support requests much higher. _Please be aware: licenses of
     different member hosting service levels cannot be combined!_`,
  ),
  ram: z
    .number()
    .min(1)
    .describe(
      "Limits the total memory a project can use. At least 2GB is recommended.",
    ),
  user: z.enum(["academic", "business"]).describe("User type."),
  source: z
    .enum(["site-license", "course"])
    .optional()
    .describe(
      "Indicates which page (license or course) was used to create this license.",
    ),
});
