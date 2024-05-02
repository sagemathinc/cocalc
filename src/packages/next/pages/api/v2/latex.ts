/*
Turn LaTeX .tex file contents into a pdf.  This run in a CoCalc
project with a configurable timeout and command, so can involve
arbitrarily sophisticated processing.

Then the path .tex file is created, if content is specified.  Next the command is run which should hopefully produce a pdf file.
Finally, the pdf file is read into our database (as a blob).
*/

import getAccountId from "lib/account/get-account";
import getOneProject from "@cocalc/server/projects/get-one";
import { getProject } from "@cocalc/server/projects/control";
import callProject from "@cocalc/server/projects/call";
import getParams from "lib/api/get-params";
import { path_split } from "@cocalc/util/misc";
import getCustomize from "@cocalc/database/settings/customize";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

const DEFAULT_COMMAND =
  "latexmk -pdf -f -g -bibtex -deps -interaction=nonstopmode";

async function handle(req, res) {
  const account_id = await getAccountId(req);
  const params = getParams(req);
  try {
    if (!account_id) {
      throw Error("must be authenticated");
    }
    if (!params.path || !params.path.endsWith(".tex")) {
      throw Error("path must be specified and end in .tex");
    }
    const { head: dir, tail: filename } = path_split(params.path);
    if (params.only_read_pdf) {
      if (params.project_id == null) {
        throw Error("if only_read_pdf is set then project_id must also be set");
      }
      if (params.path.startsWith("/tmp")) {
        throw Error(
          "if only_read_pdf is set then path must not start with /tmp (otherwise the pdf would be removed)",
        );
      }
    }

    let project_id;
    if (params.project_id != null) {
      project_id = params.project_id;
      if (!(await isCollaborator({ project_id, account_id }))) {
        throw Error("must be signed in as a collaborator on the project");
      }
    } else {
      // don't need to check collaborator in this case:
      project_id = (await getOneProject(account_id)).project_id;
    }

    let result: any = undefined;
    let compile: any = undefined;
    let pdf: any = undefined;
    let url: string | undefined = undefined;
    try {
      // ensure the project is running.
      const project = getProject(project_id);
      await project.start();

      if (!params.only_read_pdf) {
        if (params.content != null) {
          // write content to the project as the file path
          await callProject({
            account_id,
            project_id,
            mesg: {
              event: "write_text_file_to_project",
              path: params.path,
              content: params.content,
            },
          });
        }
        compile = await callProject({
          account_id,
          project_id,
          mesg: {
            event: "project_exec",
            timeout: params.timeout ?? 30,
            path: dir,
            command: params.command ?? `${DEFAULT_COMMAND} ${filename}`,
          },
        });
      }
      // TODO: should we check for errors in compile before trying to read pdf?
      const ttlSeconds = params.ttl ?? 3600;
      try {
        pdf = await callProject({
          account_id,
          project_id,
          mesg: {
            event: "read_file_from_project",
            path: pdfFile(params.path),
            ttlSeconds,
          },
        });
        const { siteURL } = await getCustomize();
        if (pdf != null) {
          url = pdf.data_uuid
            ? siteURL + `/blobs/${pdfFile(params.path)}?uuid=${pdf.data_uuid}`
            : undefined;
        }
        result = { compile, url, pdf };
      } catch (err) {
        result = { compile, error: err.message };
      }
    } finally {
      if (params.path.startsWith("/tmp")) {
        await callProject({
          account_id,
          project_id,
          mesg: {
            event: "project_exec",
            path: "/tmp",
            bash: true,
            command: `rm ${rmGlob(params.path)}`,
          },
        });
      }
    }
    res.json(result);
  } catch (err) {
    res.json({ error: err.message });
  }
}

function pdfFile(path: string): string {
  return path.slice(0, path.length - 4) + ".pdf";
}

function rmGlob(path: string): string {
  return path.slice(0, path.length - 4) + ".*";
}

// ** OpenAPI below **

import { z } from "zod";
import { apiRoute, apiRouteOperation } from "next-rest-framework";

export default apiRoute({
  latex: apiRouteOperation({
    method: "POST",
  })
    .input({
      contentType: "application/json",
      body: z
        .object({
          path: z
            .string()
            .describe(
              `Path to a .tex file.  If the file doesn't exist, it is created with the given content.  Also, if the directory containing path doesn't exist, it is created.  If the path starts with /tmp, e.g., /tmp/foo/bar.tex, then we do always do "rm /tmp/foo/bar.*" to clean up tempory files.  We do NOT do this unless the path starts with /tmp.`,
            ),
          content: z
            .string()
            .optional()
            .describe(
              "Textual content of the .tex file on which you want to run LaTeX.  If not given, path must refer to an actual file already in the project.  Then the path .tex file is created and this content written to it.",
            ),
          project_id: z
            .string()
            .uuid()
            .optional()
            .describe(
              "The v4 uuid of a project you have access to.  If not given, your most recent project is used, or if you have no projects, one is created.  The project is started if it isn't already running.  WARNING: if the project isn't running you may get an error while it is starting; if you retry in a few seconds then it works.",
            ),
          command: z
            .string()
            .optional()
            .describe(
              `LaTeX build command.  This will be run from the directory containing path and should produce the output pdf file.  If not given, we use '${DEFAULT_COMMAND} filename.tex'.`,
            ),
          timeout: z
            .number()
            .gte(5)
            .default(30)
            .describe(
              "If given, this is a timeout in seconds for how long the LaTeX build command can run before it is killed. You should increase this from the default if you're building large documents.  See also the only_read_pdf option.",
            ),
          ttl: z
            .number()
            .gte(60)
            .describe("How long in seconds the generated PDF url is valid")
            .default(3600),
          only_read_pdf: z
            .boolean()
            .optional()
            .describe(
              `Instead of running LaTeX, ONLY tries to grab the output pdf if it exists. Currently, you must also specify the project_id if you use this option, since we haven't implemented a way to know in which project the latex command was run.  When true, only_read_pdf is the same as when it is false, except only the step involving reading the pdf happens.  Use this if compiling times out for some reason due to network timeout requirements.   NOTE: only_read_pdf doesn't currently get the compilation output log.`,
            ),
        })
        .describe(
          "Turn LaTeX .tex file contents into a pdf.  This run in a CoCalc project with a configurable timeout and command, so can involve arbitrarily sophisticated processing.",
        ),
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: z.union([
          z.object({
            error: z
              .string()
              .optional()
              .describe("Error message is something goes badly wrong."),
          }),
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
                "information about reading the PDF from disk, e.g., an error if the PDF does not exist.",
              ),
          }),
        ]),
      },
    ])
    .handler(handle),
});
