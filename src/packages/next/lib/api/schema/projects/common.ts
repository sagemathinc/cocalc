import { z } from "../../framework";

export const ProjectIdSchema = z.string().uuid().describe("Project id.");

export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const ProjectTitleSchema = z
  .string()
  .describe(
    "The short title of the project. Should use no special formatting, except hashtags.",
  );

export type ProjectTitle = z.infer<typeof ProjectTitleSchema>;

export const ProjectDescriptionSchema = z.string().describe(
  `A longer textual description of the project. This can include hashtags and should
   be formatted using markdown.`,
);

export type ProjectDescription = z.infer<typeof ProjectDescriptionSchema>;

export const ProjectNameSchema = z.string().describe(
  `The optional name of this project. Must be globally unique (up to case) across all
   projects with a given *owner*. It can be between 1 and 100 characters from a-z, A-Z,
   0-9, period, and dash.`,
);

export type ProjectName = z.infer<typeof ProjectNameSchema>;
