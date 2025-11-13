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
import { DEFAULT_LATEX_COMMAND } from "lib/api/latex";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  LatexInputSchema,
  LatexOutputSchema,
} from "lib/api/schema/latex";


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
            command: params.command ?? `${DEFAULT_LATEX_COMMAND} ${filename}`,
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

export default apiRoute({
  latex: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Utils"]
    },
  })
    .input({
      contentType: "application/json",
      body: LatexInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: LatexOutputSchema,
      },
    ])
    .handler(handle),
});
