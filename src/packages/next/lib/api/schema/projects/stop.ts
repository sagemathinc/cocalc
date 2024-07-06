import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ProjectIdSchema } from "./common";

// OpenAPI spec
//
export const StopProjectInputSchema = z
  .object({
    project_id: ProjectIdSchema,
  })
  .describe("Stops a running project.");

export const StopProjectOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type StopProjectInput = z.infer<typeof StopProjectInputSchema>;
export type StopProjectOutput = z.infer<typeof StopProjectOutputSchema>;
