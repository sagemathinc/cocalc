import { z } from "../../framework";

export const ProjectIdSchema = z
  .string()
  .uuid()
  .describe("Project id.");

export type ProjectId = z.infer<typeof ProjectIdSchema>;
