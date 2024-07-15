import { z } from "../framework";

import { FailedAPIOperationSchema } from "./common";
import { ComputeServerIdSchema } from "./compute/common";
import { ProjectIdSchema } from "./projects/common";

// OpenAPI spec
//
export const ExecInputSchema = z
  .union([
    z.object({
      project_id: ProjectIdSchema,
      compute_server_id: ComputeServerIdSchema.describe(
        `If provided, the desired shell command will be run on the compute server whose id
       is specified in this field (if available).`,
      ).optional(),
      filesystem: z
        .boolean()
        .optional()
        .describe(
          `If \`true\`, this shell command runs in the fileserver container on the compute
         server; otherwise, it runs on the main compute container.`,
        ),
      path: z
        .string()
        .optional()
        .describe(
          "Path to working directory in which the shell command should be executed.",
        ),
      command: z.string().describe("The shell command to execute."),
      args: z
        .array(z.string())
        .optional()
        .describe("An array of arguments to pass to the shell command."),
      timeout: z
        .number()
        .min(0)
        .default(60)
        .optional()
        .describe("Number of seconds before this shell command times out."),
      max_output: z
        .number()
        .min(0)
        .optional()
        .describe(
          "Maximum number of bytes to return from shell command output.",
        ),
      bash: z
        .boolean()
        .optional()
        .describe(
          `If \`true\`, this command runs in a \`bash\` shell. To do so, the provided shell
         command is written to a file and then executed via the \`bash\` command.`,
        ),
      aggregate: z
        .union([
          z.number(),
          z.string(),
          z.object({ value: z.union([z.string(), z.number()]) }),
        ])
        .optional()
        .describe(
          `If provided, this shell command is aggregated as in
         \`src/packages/backend/aggregate.js\`. This parameter allows one to specify
         multiple callbacks to be executed against the output of the same command
         (given identical arguments) within a 60-second window.`,
        ),
      err_on_exit: z
        .boolean()
        .optional()
        .describe(
          `When \`true\`, this call will throw an error whenever the provided shell command
         exits with a non-zero exit code.`,
        ),
      env: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Environment variables to be passed to the shell command upon execution.",
        ),
      async_mode: z.boolean().optional()
        .describe(`If \`true\`, the execution happens asynchroneously.
This means this API call does not block and returns an ID (\`async_id\`).
Later, use that ID in a call to \`async_get\` to eventually get the result.

Additionally and if not specified: \`max_output\` is set to 1MB and and \`timeout\` to 10 minutes.`),
    }),

    z.object({
      project_id: ProjectIdSchema,
      async_get: z.string().optional()
        .describe(`For a given \`async_id\` returned by \`async\`,
      retun the status, or the result as if it is called synchroneously.
      Results are only cached temporarily!`),
    }),
  ])
  .describe("Perform arbitrary shell commands in a compute server or project.");

export const ExecOutputSchema = z.union([
  z
    .object({
      stdout: z.string().describe("Output to stdout"),
      stderr: z.string().describe("Output to stderr"),
      exit_code: z
        .number()
        .describe(
          "The numeric exit code. 0 usually means it ran without any issues.",
        ),
      async_id: z
        .string()
        .optional()
        .describe("The ID identifying the async operation (async only)"),
      async_start: z
        .number()
        .optional()
        .describe("UNIX timestamp when execution started (async only)"),
      elapsed_s: z
        .string()
        .optional()
        .describe("How long the execution took (async only)"),
      async_status: z // AsyncStatus
        .union([
          z.literal("running"),
          z.literal("completed"),
          z.literal("error"),
        ])
        .optional()
        .describe("Status of async operation."),
    })
    .describe("Output of executed command."),
  FailedAPIOperationSchema,
]);

export type ExecInput = z.infer<typeof ExecInputSchema>;
export type ExecOutput = z.infer<typeof ExecOutputSchema>;
