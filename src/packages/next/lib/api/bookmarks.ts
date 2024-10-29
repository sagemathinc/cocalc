/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

import {
  BookmarkGetInputSchema,
  BookmarkSetInputSchema,
} from "lib/api/schema/bookmarks";

// Process a request for the api/v2/bookmarks/* endpoints

// TODO: deduplicate this with proper typing

export async function processSetRequest(req) {
  // ATTN: very confusing: this is the account_id or project_id for project level API keys
  // Since bookmakrs are account specific (and collaborators shouldn't snoop on others), we block project keys
  // In the future, there might be project-wide stars, which are not account specific.
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }

  const data = BookmarkSetInputSchema.parse(getParams(req));

  if (account_id === data.project_id) {
    throw new Error(
      `As of now, you cannot use a project-level API key to modify account specific bookmarks. Use the account level API key!`,
    );
  }

  if (!(await isCollaborator({ account_id, project_id: data.project_id }))) {
    throw Error("user must be a collaborator on the project");
  }

  return { ...data, account_id };
}

export async function processGetRequest(req) {
  // ATTN: very confusing: this is the account_id or project_id for project level API keys
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }

  const data = BookmarkGetInputSchema.parse(getParams(req));

  if (account_id === data.project_id) {
    throw new Error(
      `As of now, you cannot use a project-level API key to modify account specific bookmarks. Use the account level API key!`,
    );
  }

  if (!(await isCollaborator({ account_id, project_id: data.project_id }))) {
    throw Error("user must be a collaborator on the project");
  }

  return { ...data, account_id };
}
