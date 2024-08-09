/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { z } from "../framework";

import { PROJECT_EXEC_DEFAULT_TIMEOUT_S } from "@cocalc/util/consts/project";
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
      .default(PROJECT_EXEC_DEFAULT_TIMEOUT_S)
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
      .min(0)
      .optional()
      .describe("Set the `UID` identity of the spawned process."),
    gid: z
      .number()
      .min(0)
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

const ExecInputSchemaAsyncCommon = ExecInputCommon.merge(
  z.object({
    project_id: ProjectIdSchema,
    async_stats: z
      .boolean()
      .describe(
        `If true, retrieve recorded statistics (CPU/memory) of the process and its child processes.`,
      ),
  }),
);

const ExecInputSchemaAsync = ExecInputSchemaAsyncCommon.merge(
  z.object({
    async_get: z.string()
      .describe(`For a given \`job_id\` job, which has been returned when setting \`async_call=true\`,
retrieve the corresponding status or the result.

The returned object contains the current \`stdout\` and \`stderr\` output, the \`pid\`,
as well as a status field indicating if the job is still running or has completed.
Start time and duration are returned as well.

Note: Results are cached temporarily in the project.`),
    async_await: z.boolean().optional()
      .describe(`If \`true\`, the call opens a "hanging" HTTP polling connection,
until the given \`job_id\` job has completed.
If the job already finished, this is equivalent to an \`async_get\` call without this parameter.

Note: If it times out, you have to reconnect on your end.`),
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
  start: z.number().describe("UNIX timestamp, when the execution started"),
  elapsed_s: z.string().optional().describe("How long the execution took"),
  status: z // AsyncStatus
    .union([z.literal("running"), z.literal("completed"), z.literal("error")])
    .describe("Status of the async operation"),
  pid: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Process ID. If not returned, then there has been a fundamenal problem spawning the process.",
    ),
  stats: z
    .array(
      z.object({
        timestamp: z.number().describe("UNIX epoch timestamp"),
        mem_rss: z
          .number()
          .describe(
            "Sum of residual memory usage of that process and its children.",
          ),
        cpu_pct: z
          .number()
          .describe(
            "Sum of percentage CPU usage of that process and its children.",
          ),
        cpu_secs: z
          .number()
          .describe(
            "Sum of CPU time usage (user+system) of that process and its children.",
          ),
      }),
    )
    .optional()
    .describe(
      `Recorded metrics about the process. Each entry has a timestamp and corresponding cpu and memory usage, of that process and children. Initially, the sampling frequency is higher, but then it is spaced out. The total number of samples is truncated, discarding the oldest ones.

You can visualize the data this way:

\`\`\`python
import matplotlib.pyplot as plt
from datetime import datetime

# Extract stats data
timestamps = [stat['timestamp'] for stat in data['stats']]
mem_rss = [stat['mem_rss'] for stat in data['stats']]
cpu_pct = [stat['cpu_pct'] for stat in data['stats']]

# Convert timestamps to datetime objects
timestamps = [datetime.fromtimestamp(ts / 1000) for ts in timestamps]

# Create plots
fig, ax1 = plt.subplots()

# Memory usage
ax1.plot(timestamps, mem_rss, color='blue', label='Memory (RSS)')
ax1.set_xlabel('Time')
ax1.set_ylabel('Memory (MB)', color='blue')
ax1.tick_params(axis='y', labelcolor='blue')
ax1.set_ylim(bottom=0)

# CPU utilization (secondary axis)
ax2 = ax1.twinx()
ax2.plot(timestamps, cpu_pct, color='red', label='CPU (%)')
ax2.set_ylabel('CPU (%)', color='red')
ax2.tick_params(axis='y', labelcolor='red')
ax2.set_ylim(bottom=0)

# Add labels and legend
plt.title('Job Stats')
plt.legend(loc='upper left')

# Display the plot
plt.show()
\`\`\`
`,
    ),
});

export const ExecOutputSchema = z.union([
  z
    .discriminatedUnion("type", [ExecOutputBlocking, ExecOutputAsync])
    .describe("Output of executed command."),
  FailedAPIOperationSchema,
]);

export type ExecInput = z.infer<typeof ExecInputSchema>;
export type ExecOutput = z.infer<typeof ExecOutputSchema>;
