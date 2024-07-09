import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ProjectIdSchema } from "./common";

// OpenAPI spec
//
export const StartProjectInputSchema = z
  .object({
    project_id: ProjectIdSchema,
  })
  .describe("Starts a running project.");

export const StartProjectOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type StartProjectInput = z.infer<typeof StartProjectInputSchema>;
export type StartProjectOutput = z.infer<typeof StartProjectOutputSchema>;
