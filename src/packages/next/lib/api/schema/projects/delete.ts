import { z } from "../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../common";

import { ProjectIdSchema } from "./common";

// OpenAPI spec
//
export const DeleteProjectInputSchema = z
  .object({
    project_id: ProjectIdSchema,
  })
  .describe(
    `Deletes a specific project. This causes three operations to occur in succession.
     First, the project is stopped. Finally, the project's \`delete\` flag in the database is 
     set, which removes it from the user interface. This operation may be reversed by 
     restoring the project via the API.`,
  );

export const DeleteProjectOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type DeleteProjectInput = z.infer<typeof DeleteProjectInputSchema>;
export type DeleteProjectOutput = z.infer<typeof DeleteProjectOutputSchema>;
