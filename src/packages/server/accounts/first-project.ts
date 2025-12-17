/* Create a first project for this user and add some content to it
   Inspired by the tags. */

import createProject from "@cocalc/server/projects/create";
import { TAGS_MAP } from "@cocalc/util/db-schema/accounts";
import { getLogger } from "@cocalc/backend/logger";
import { getProject } from "@cocalc/server/projects/control";
import callProject from "@cocalc/server/projects/call";
import getKernels from "@cocalc/server/jupyter/kernels";
import { isValidUUID } from "@cocalc/util/misc";
import type { RegistrationTokenCustomize } from "@cocalc/util/types/registration-token";

// If true, create welcome files based on tags.
// disabled because based on data with users, it doesn't help.
// Or maybe the files just aren't good enough (?).  In practice,
// people get confused, then finally figure out what to really do,
// and do it in the welcome/ directory, which just means
// a cluttered experience.
const WELCOME_FILES = false;

const log = getLogger("server:accounts:first-project");

export default async function firstProject({
  account_id,
  tags,
  dontStartProject,
  ephemeral,
  customize,
}: {
  account_id: string;
  tags?: string[];
  dontStartProject?: boolean;
  ephemeral?: number;
  customize?: RegistrationTokenCustomize;
}): Promise<string> {
  log.debug(account_id, tags);
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  const project_id = await createProject({
    account_id,
    title: ephemeral ? "My Project" : "My First Project",
    ephemeral,
    customize,
  });
  log.debug("created new project", project_id);
  if (!dontStartProject) {
    const project = getProject(project_id);
    await project.start();
  }
  if (!WELCOME_FILES || tags == null || tags.length == 0) {
    return project_id;
  }
  for (const tag of tags) {
    if (tag == "ipynb") {
      // make Jupyter notebooks for languages of interest
      // these are the actual kernels supported by this project:
      const kernels = await getKernels({ project_id, account_id });
      for (const tag2 of tags) {
        const {
          language,
          welcome = "",
          jupyterExtra = "",
        } = TAGS_MAP[tag2] ?? {};
        if (language) {
          await createJupyterNotebookIfAvailable(
            kernels,
            account_id,
            project_id,
            language,
            welcome + jupyterExtra,
          );
        }
      }
    } else {
      const welcome = TAGS_MAP[tag]?.welcome;
      if (welcome != null) {
        // make welcome file
        await createWelcome(account_id, project_id, tag, welcome);
      }
    }
  }

  return project_id;
}

async function createJupyterNotebookIfAvailable(
  kernels,
  account_id: string,
  project_id: string,
  language: string,
  welcome: string,
): Promise<string> {
  // find the highest priority kernel with the given language
  let kernelspec: any = null;
  let priority: number = -9999999;
  for (const kernel of kernels) {
    const kernelPriority = kernel.metadata?.cocalc?.priority ?? 0;
    if (kernel.language == language && kernelPriority > priority) {
      kernelspec = kernel;
      priority = kernelPriority;
    }
  }
  if (kernelspec == null) return "";

  const content = {
    cells: [
      {
        cell_type: "code",
        execution_count: 0,
        metadata: {
          collapsed: false,
        },
        outputs: [],
        source: welcome?.split("\n").map((x) => x + "\n") ?? [],
      },
    ],
    metadata: {
      kernelspec,
    },
    nbformat: 4,
    nbformat_minor: 4,
  };
  const path = `welcome/${language}.ipynb`;
  await callProject({
    account_id,
    project_id,
    mesg: {
      event: "write_text_file_to_project",
      path,
      content: JSON.stringify(content, undefined, 2),
    },
  });
  // TODO: Put an appropriate prestarted kernel in the pool.
  // This is an optimization and it's not easy.
  return path;
}

async function createWelcome(
  account_id: string,
  project_id: string,
  ext: string,
  welcome: string,
): Promise<string> {
  const path = `welcome/welcome.${ext}`;
  const { torun } = TAGS_MAP[ext] ?? {};
  let content = welcome;
  if (torun) {
    content = `${torun}\n\n${content}`;
  }
  await callProject({
    account_id,
    project_id,
    mesg: {
      event: "write_text_file_to_project",
      path,
      content,
    },
  });
  return path;
}
