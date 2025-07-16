/*
api.github.com is very nice to use to get info, but

"Unauthenticated clients can make **60 requests per hour**."
https://docs.github.com/en/rest/guides/getting-started-with-the-rest-api

So it's completely useless for our purposes without authentication.

"When authenticating, you should see your rate limit bumped to 5,000 requests an hour,"

which is also hopefully sufficient, but worrisome.

Thoughts:

- Since all rendering could be done client side, I could actually have
the client browser grab content instead of the server, then render there to
massively reduce api load, although even users could quickly hit "60 requests
per hour", so the api still wouldn't help.

- If we do hit the 5K/hour limit, maybe we can use more than one api key?

- Upgrading to enterprise doesn't increase this much.

- We could switch to mirroring and cloning files locally, and that might
  work around this problem in practice, but be a lot of work. We'll see.


Get at https://github.com/settings/tokens
*/

// these are provided by nextjs: https://nextjs.org/blog/next-9-4#improved-built-in-fetch-support
declare var fetch, Headers;

import { encode } from "base-64";
import { join } from "path";
import getPool from "@cocalc/database/pool";

// We don't allow just fetching content that is arbitrarily large, since that could cause
// the server to just run out of memory.  However, we want this to reasonably big.
export const RAW_MAX_SIZE_BYTES = 10000000; // 10MB

// TODO: we will also have a raw blob or stream or something for serving up images, etc.,
export async function rawText(
  githubOrg: string,
  githubRepo: string,
  segments: string[],
): Promise<string> {
  const url = rawURL(githubOrg, githubRepo, segments);
  //console.log("raw:", { url });
  return await (await fetch(url, { size: RAW_MAX_SIZE_BYTES })).text();
}

function rawURL(
  githubOrg: string,
  githubRepo: string,
  segments: string[],
): string {
  return `https://raw.githubusercontent.com/${githubOrg}/${githubRepo}/${join(
    ...segments.slice(1),
  )}`;
}

interface GithubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: "file" | "dir";
  content: string;
  encoding: string;
}

async function credentials(): Promise<{
  github_username?: string;
  github_token?: string;
  github_block?: string;
}> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT name, value FROM server_settings WHERE name='github_username' OR name='github_token' OR name='github_block'",
  );
  let result: {
    github_username?: string;
    github_token?: string;
    github_block?: string;
  } = {};
  for (const row of rows) {
    result[row.name] = row.value;
  }
  return result;
}

function isBlocked(path: string, github_block?: string) {
  if (!github_block) {
    return false;
  }
  const path1 = path.toLowerCase();
  for (const x of github_block.split(",")) {
    const y = x.trim().toLowerCase();
    if (path1.includes(y)) {
      return true;
    }
  }
  return false;
}

export async function api(path: string): Promise<any> {
  const url = `https://api.github.com/${path}`;
  const options: any = {};
  const { github_username, github_token, github_block } = await credentials();
  if (isBlocked(path, github_block)) {
    throw Error(
      `Path '${path}' is blocked by the site admins.  If you think this is a mistake, please contact support.`,
    );
  }
  if (github_username && github_token) {
    options.headers = new Headers({
      Authorization: "Basic " + encode(`${github_username}:${github_token}`),
      "Content-Type": "application/json",
    });
  }
  //console.log(options);
  const response = await fetch(url, options);
  //console.log(response.headers);
  const data: any = await response.json();
  //console.log({ url, response });
  if (data.message) {
    throw Error(`${data.message}  (see ${data.documentation_url})`);
  }
  return data;
}

// Use the github api to get the contents of a path on github.
// We are planning to use this just to get directory listings,
// since individual files have their content base64 encoded, etc.,
// and that has to be much slower than just grabbing the
// file form raw (and also only works up to 1MB according to
// github docs).
// How to do auth + fetch with node: https://stackoverflow.com/questions/43842793/basic-authentication-with-fetch
export async function contents(
  githubOrg: string,
  githubRepo: string,
  segments: string[],
): Promise<GithubFile[]> {
  let ref, path;
  if (segments.length == 0) {
    ref = ""; // the default;
    path = ""; // root
  } else {
    // tree/[ref]/[path ...]
    ref = segments[1];
    path = join(...segments.slice(2));
  }
  const result = await api(
    `repos/${githubOrg}/${githubRepo}/contents/${path}${
      ref ? "?ref=" + ref : ""
    }`,
  );
  if (result.name != null) {
    throw Error(
      "only use contents to get directory listing, not to get file contents",
    );
  }
  return result;
}

export async function defaultBranch(
  githubOrg: string,
  githubRepo: string,
): Promise<string> {
  return (await api(`repos/${githubOrg}/${githubRepo}`)).default_branch;
}

// Return all the repositories in a GitHub organization or user:
export async function repos(githubOrg: string): Promise<{ name: string }[]> {
  let result;
  try {
    result = await api(`orgs/${githubOrg}/repos`);
  } catch (err) {
    result = await api(`users/${githubOrg}/repos`);
  }
  return result
    .filter((repo) => !repo.private)
    .map((repo) => {
      return {
        isdir: true,
        name: repo.name,
        mtime: new Date(repo.updated_at).valueOf(),
        url: `/github/${githubOrg}/${repo.name}`,
      };
    });
}

export async function fileInGist(gistId: string): Promise<string> {
  const info = await api(`gists/${gistId}`);
  for (const filename in info.files) {
    return filename;
  }
  throw Error("no files in the gist");
}
