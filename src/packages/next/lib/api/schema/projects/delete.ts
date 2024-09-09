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
     Firstly, all project licenses associated with the project are removed. Next, the 
     project is stopped. Finally, the project's \`delete\` flag in the database is 
     set, which removes it from the user interface. This operation may be reversed by 
     restoring the project via the API, with the proviso that all information about 
     applied project licenses is lost in the delete operation.`,
  );

export const DeleteProjectOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type DeleteProjectInput = z.infer<typeof DeleteProjectInputSchema>;
export type DeleteProjectOutput = z.infer<typeof DeleteProjectOutputSchema>;
