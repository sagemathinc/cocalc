import { z } from "../framework";

import { DEFAULT_LATEX_COMMAND } from "../latex";

import { FailedAPIOperationSchema } from "./common";

// OpenAPI spec
//
export const LatexInputSchema = z
  .object({
    path: z
      .string()
      .describe(
        `Path to a .tex file. If the file doesn't exist, it is created with the
        given content. Also, if the directory containing path doesn't exist, it
        is created. If the path starts with \`/tmp\` (e.g., 
        \`/tmp/foo/bar.tex\`), then we do always do \`rm /tmp/foo/bar.*\` to
        clean up temporary files. We do _not_ do this unless the path starts
        with \`/tmp\`.`,
      ),
    content: z
      .string()
      .optional()
      .describe(
        `Textual content of the .tex file on which you want to run LaTeX. If
        not given, path must refer to an actual file already in the project.
        Then the path \`.tex\` file is created and this content written to it.`,
      ),
    project_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        `The v4 uuid of a project you have access to. If not given, your most
        recent project is used, or if you have no projects, one is created. The
        project is started if it isn't already running. **WARNING:** if the
        project isn't running you may get an error while it is starting; if you
        retry in a few seconds then it works.`,
      ),
    command: z
      .string()
      .optional()
      .describe(
        `LaTeX build command. This will be run from the directory containing
        path and should produce the output pdf file.  If not given, we use
        \`${DEFAULT_LATEX_COMMAND} filename.tex\`.`,
      ),
    timeout: z
      .number()
      .gte(5)
      .default(30)
      .describe(
        `If given, this is a timeout in seconds for how long the LaTeX build
        command can run before it is killed. You should increase this from the
        default if you're building large documents.  See also the 
        \`only_read_pdf\` option.`,
      ),
    ttl: z
      .number()
      .gte(60)
      .describe("Time in seconds for which generated PDF url is valid.")
      .default(3600),
    only_read_pdf: z
      .boolean()
      .optional()
      .describe( `Instead of running LaTeX, we **only** try to grab the output pdf if it
        exists. Currently, you must also specify the \`project_id\` if you use
        this option, since we haven't implemented a way to know in which project
        the latex command was run. When true, \`only_read_pdf\` is the same as
        when it is false, except only the step involving reading the pdf
        happens. Use this if compiling times out for some reason due to network
        timeout requirements.  **NOTE:** \`only_read_pdf\` doesn't currently
        get the compilation output log.`,
      ),
  })
  .describe(
    `Turn LaTeX .tex file contents into a pdf.  This run in a CoCalc project
    with a configurable timeout and command, so can involve arbitrarily
    sophisticated processing.`,
  )

export const LatexOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    compile: z.object({
      stdout: z.string(),
      stderr: z.string(),
      exit_code: z.number(),
    }),
    url: z
      .string()
      .describe("URL where you can view the generated PDF file"),
    pdf: z
      .string()
      .describe(
        `Information about reading the PDF from disk, e.g., an error if the PDF
         does not exist.`,
      ),
  }),
]);

export type LatexInput = z.infer<typeof LatexInputSchema>;
export type LatexOutput = z.infer<typeof LatexOutputSchema>;
