import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ProjectIdSchema } from "./common";

// OpenAPI spec
//
export const RestoreProjectInputSchema = z
  .object({
    project_id: ProjectIdSchema,
  })
  .describe(
    `Restores a specific project from its deleted state, which clears the project's 
    \`delete\` flag in the database and restores it to the user interface. Note that any 
    previously applied project licenses must be re-applied to the project upon 
    restoration.`,
  );

export const RestoreProjectOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type RestoreProjectInput = z.infer<typeof RestoreProjectInputSchema>;
export type RestoreProjectOutput = z.infer<typeof RestoreProjectOutputSchema>;
