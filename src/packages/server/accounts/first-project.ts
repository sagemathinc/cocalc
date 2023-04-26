/* Create a first project for this user and add some content to it
   Inspired by the tags. */

import createProject from "@cocalc/server/projects/create";
import { TAGS } from "@cocalc/util/db-schema/accounts";
import { getLogger } from "@cocalc/backend/logger";
import { getProject } from "@cocalc/server/projects/control";
import callProject from "@cocalc/server/projects/call";
import getKernels from "@cocalc/server/jupyter/kernels";

const log = getLogger("server:accounts:first-project");

export default async function firstProject({
  account_id,
  tags,
}: {
  account_id: string;
  tags: string[];
}): Promise<string> {
  log.debug(account_id, tags);
  const project_id = await createProject({
    account_id,
    title: "My First Project",
  });
  log.debug("created new project", project_id);
  const project = getProject(project_id);
  await project.start();

  if (tags.length > 0) {
    const tagsSet = new Set(tags);
    if (tagsSet.has("ipynb")) {
      let n = 0;
      for (const tag of tagsSet) {
        if (
          (await createJupyterNotebookIfPossible(
            account_id,
            project_id,
            tag
          )) != ""
        ) {
          n += 1;
        }
      }
      if (n == 0) {
        await createJupyterNotebookIfPossible(account_id, project_id, "py");
      }
    }
    for (const { tag, welcome } of TAGS) {
      if (tag == "ipynb") {
        // handled above
        continue;
      }
      if (welcome) {
        await createWelcome(account_id, project_id, tag, welcome);
      }
    }
  }
  return project_id;
}

async function createJupyterNotebookIfPossible(
  account_id: string,
  project_id: string,
  ext: string
): Promise<string> {
  // these are the actual kernels supported by this project:
  const kernels = await getKernels({ project_id, account_id });
  // which kernels to use for ext.  If there is one, we make a sample
  // notebook and start the kernel pool.  If not, do nothing.

  let kernelName;
  // TODO!
  if (ext == "py") {
    kernelName = "python3";
  } else if (ext == "sage") {
    kernelName = "sage-9.8";
  } else if (ext == "r") {
    kernelName = "ir";
  } else {
    return "";
  }
  const content = `{
 "cells": [],
 "metadata": {
  "kernelspec": {
   "name": "${kernelName}"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 4
}`;
  let path = ext + ".ipynb";
  for (const { label, tag } of TAGS) {
    if (tag == ext) {
      path = label + ".ipynb";
      break;
    }
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
  // TODO: and start the pool...

  return path;
}

async function createWelcome(
  account_id: string,
  project_id: string,
  ext: string,
  welcome: string
): Promise<string> {
  const path = `welcome.${ext}`;
  await callProject({
    account_id,
    project_id,
    mesg: {
      event: "write_text_file_to_project",
      path,
      content: welcome,
    },
  });
  return path;
}
