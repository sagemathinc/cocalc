/*
Turn latex file contents into a pdf.

You can call this either via GET or POST, but of course POST makes way more sense.
The parameters are:

- project_id: *optional* project in which to run latex.  If not given, your most recent project is used, or if you have no projects, one is created.
- content: *optional* textual content of the .tex file you want to latex.  If not given, path must refer to an actual file already in the project.
- path: required path to a .tex file.  If the file doesn't exist, it is created with the given content.  Also, if the directory containing path
  doesn't exist, it is created.
- command: *optional* latex build command.  This will be run from the directory containing path and should produce the output pdf file.
  If not given, we use latexmk.
- timeout: if given, this is a timeout on how long the latex build command can run before it is killed.
- ttl: how long the resulting PDF url is valid (default: 1 hour)


When you call this API the project is started if it isn't already running.  Then the path .tex file
is created, if content is specified.  Next the command is run which should hopefully produce a pdf file.
Finally, the pdf file is read into our database (as a blob), and the API call returns an object with
this shape:

{error?: '... message if something goes badly wrong ...',
compile: {
   stdout: string
   stderr: string
   exit_code: number
},
url: URL where you can view the generated PDF file
pdf: information about reading the PDF from disk, e.g., an
error if the PDF doesn't exist.

Finally, if the path starts with /tmp, e.g., /tmp/foo/bar.tex, then we do always do "rm /tmp/foo/bar.*"
to clean up temp file.  We do NOT do this unless the path starts with /tmp.


TODO/WARNING: For some reason on kucalc (so cocalc.com), if the project isn't running you'll
get an error while it is starting.  If you retry in a few seconds then it works.  On cocalc-docker
and dev mode it all seems to work fine in terms of starting the project, then using.
*/

import getAccountId from "lib/account/get-account";
import { getOneProject } from "./projects/get-one";
import { getProject } from "@cocalc/server/projects/control";
import { callProject } from "./projects/call";
import getParams from "lib/api/get-params";
import { path_split } from "@cocalc/util/misc";
import getCustomize from "@cocalc/server/settings/customize";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  const params = getParams(req, [
    "project_id",
    "content",
    "path",
    "command",
    "timeout",
    "ttl",
    "leave",
  ]);
  try {
    if (!account_id) {
      throw Error("must be authenticated");
    }
    if (!params.path || !params.path.endsWith(".tex")) {
      throw Error("path must be specified and end in .tex");
    }
    const { head: dir, tail: filename } = path_split(params.path);
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
    try {
      // ensure the project is running.
      const project = getProject(project_id);
      await project.start();

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
      const compile = await callProject({
        account_id,
        project_id,
        mesg: {
          event: "project_exec",
          timeout: params.timeout,
          path: dir,
          command:
            params.command ??
            `latexmk -pdf -f -g -bibtex -deps -interaction=nonstopmode ${filename}`,
        },
      });
      // check for errors in compie before trying to read pdf. here...
      const ttlSeconds = params.ttl ?? 3600;
      const pdf = await callProject({
        account_id,
        project_id,
        mesg: {
          event: "read_file_from_project",
          path: pdfFile(params.path),
          ttlSeconds,
        },
      });
      const { siteURL } = await getCustomize();
      const url = pdf.data_uuid
        ? siteURL + `/blobs/${pdfFile(params.path)}?uuid=${pdf.data_uuid}`
        : undefined;
      result = { compile, url, pdf };
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
