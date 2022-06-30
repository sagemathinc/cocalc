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

import fetch, { Headers } from "node-fetch";
import { encode } from "base-64";
import { join } from "path";

// We don't allow just fetching content that is arbitrarily large, since that could cause
// the server to just run out of memory.  However, we want this to reasonably big.
const RAW_MAX_SIZE_BYTES = 25000000; // 25MB

// TODO: we will also have a raw blob or stream or something for serving up images, etc.,
export async function rawText(
  githubOrg: string,
  githubRepo: string,
  segments: string[]
): Promise<string> {
  const url = rawURL(githubOrg, githubRepo, segments);
  console.log("raw:", { url });
  return await (await fetch(url, { size: RAW_MAX_SIZE_BYTES })).text();
}

function rawURL(
  githubOrg: string,
  githubRepo: string,
  segments: string[]
): string {
  return `https://raw.githubusercontent.com/${githubOrg}/${githubRepo}/${join(
    ...segments.slice(1)
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

interface GithubError {
  message: string;
  documentation_url: string;
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
  segments: string[]
): Promise<GithubFile | GithubFile[] | GithubError> {
  let ref, path;
  if (segments.length == 0) {
    ref = ""; // the default;
    path = ""; // root
  } else {
    // tree/[ref]/[path ...]
    ref = segments[1];
    path = join(...segments.slice(2));
  }
  const url = `https://api.github.com/repos/${githubOrg}/${githubRepo}/contents/${path}${
    ref ? "?ref=" + ref : ""
  }`;
  const headers = new Headers({
    Authorization: "Basic " + encode(`${username}:${password}`),
    "Content-Type": "application/json",
  });
  console.log({ url, headers });
  const result = await (await fetch(url, { headers })).json();
  return result;
}
