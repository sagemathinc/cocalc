/*
Add, remove and invite collaborators on projects.
*/

import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import type { AddCollaborator } from "@cocalc/conat/hub-api/projects";

export async function removeCollaborator({
  account_id,
  opts,
}: {
  account_id: string;
  opts: {
    account_id;
    project_id;
  };
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id: opts.project_id }))) {
    throw Error("user must be a collaborator");
  }
  // @ts-ignore
  await callback2(db().remove_collaborator_from_project, opts);
}

export async function addCollaborator({
  account_id,
  opts,
}: {
  account_id: string;
  opts: AddCollaborator;
}): Promise<{ project_id?: string | string[] }> {
  //   if (!(await isCollaborator({ account_id, project_id: opts.project_id }))) {
  //     throw Error("user must be a collaborator");
  //   }
  console.log({ account_id, opts });
  throw Error("not implemented");
}

export async function inviteCollaborator({
  account_id,
  opts,
}: {
  account_id: string;
  opts: {
    project_id: string;
    account_id: string;
    title?: string;
    link2proj?: string;
    replyto?: string;
    replyto_name?: string;
    email?: string;
    subject?: string;
  };
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id: opts.project_id }))) {
    throw Error("user must be a collaborator");
  }

  throw Error("not implemented");
}

export async function inviteCollaboratorWithoutAccount({
  account_id,
  opts,
}: {
  account_id: string;
  opts: {
    project_id: string;
    title: string;
    link2proj: string;
    replyto?: string;
    replyto_name?: string;
    to: string;
    email: string; // body in HTML format
    subject?: string;
  };
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id: opts.project_id }))) {
    throw Error("user must be a collaborator");
  }
  throw Error("not implemented");
}
