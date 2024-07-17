import { z } from "../framework";

import { FailedAPIOperationSchema } from "./common";
import { ComputeServerIdSchema } from "./compute/common";
import { ProjectIdSchema } from "./projects/common";

const ExecInputCommon = z.object({
  project_id: ProjectIdSchema,
});

const ExecInputSchemaBlocking = ExecInputCommon.merge(
  z.object({
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
      .describe("Maximum number of bytes to return from shell command output."),
    bash: z
      .boolean()
      .optional()
      .describe(
        `If \`true\`, this command runs in a \`bash\` shell. To do so, the provided shell
           command is written to a file and then executed via the \`bash\` command.`,
      ),
    home: z
      .string()
      .optional()
      .describe(
        `Specify \`$HOME\`. If not set, it is inferred from the environment's \`$HOME\``,
      ),
    uid: z
      .number()
      .optional()
      .describe("Set the `UID` identity of the spawned process."),
    gid: z
      .number()
      .optional()
      .describe("Set the `GID` identity of the spawned process."),
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
        `When \`true\` (the default),
          this call will throw an error whenever the provided shell command
          exits with a non-zero exit code.`,
      ),
    env: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Environment variables to be passed to the shell command upon execution.",
      ),
    async_call: z.boolean().optional()
      .describe(`If \`true\`, the execution happens asynchronously.
The API call does not block and returns an ID (\`job_id\`).

Later, use that ID in a call to \`async_get\` to get status updates, partial output, and eventually the final result.
In such a call, you also have to set the \`project_id\`, because the results are cached in the project.

Additionally and if not specified, \`max_output\` is set to 1MB and and \`timeout\` to 10 minutes.

NOTE: This does not support executing code on compute servers – only inside the project itself.

HINT: set \`err_on_exit=false\`, to recieve the real \`exit_code\` of the executed command and status ends with "completed", unless there is a fundamental problem running the command.
`),
  }),
);

const ExecInputSchemaAsync = ExecInputCommon.merge(
  z.object({
    project_id: ProjectIdSchema,
    async_get: z.string().optional()
      .describe(`For a given \`job_id\`, which has been returned when setting \`async_call=true\`,
retrieve the corresponding status or the result.

The returned object contains the current \`stdout\` and \`stderr\` output,
as well as a status field indicating if the job is still running or has completed.
Start time and duration are returned as well.

Results are cached temporarily in the project.`),
  }),
);

export const ExecInputSchema = z
  .union([ExecInputSchemaBlocking, ExecInputSchemaAsync])
  .refine((data) => {
    if ("async_get" in data) {
      return ExecInputSchemaAsync.safeParse(data).success;
    } else {
      return ExecInputSchemaBlocking.safeParse(data).success;
    }
  })
  .describe("Perform arbitrary shell commands in a compute server or project.");

const ExecOutputBlocking = z.object({
  type: z.literal("blocking"),
  stdout: z.string().describe("Output to stdout"),
  stderr: z.string().describe("Output to stderr"),
  exit_code: z
    .number()
    .describe(
      "The numeric exit code. 0 usually means it ran without any issues.",
    ),
});

const ExecOutputAsync = ExecOutputBlocking.extend({
  type: z.literal("async"),
  job_id: z.string().describe("The ID identifying the async operation"),
  start: z
    .number()
    .optional()
    .describe("UNIX timestamp, when the execution started"),
  elapsed_s: z.string().optional().describe("How long the execution took"),
  status: z // AsyncStatus
    .union([z.literal("running"), z.literal("completed"), z.literal("error")])
    .describe("Status of the async operation"),
});

export const ExecOutputSchema = z.union([
  z
    .discriminatedUnion("type", [ExecOutputBlocking, ExecOutputAsync])
    .describe("Output of executed command."),
  FailedAPIOperationSchema,
]);

export type ExecInput = z.infer<typeof ExecInputSchema>;
export type ExecOutput = z.infer<typeof ExecOutputSchema>;
