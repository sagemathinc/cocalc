/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import LRU from "lru-cache";

// no TTL, since a given text never changes its rendered representation
const renderCache = new LRU<string, string>({ max: 100 });

import { sha1 } from "@cocalc/backend/sha1";
import { markdown_to_html } from "@cocalc/frontend/markdown";

export function renderMarkdown(text: string): string {
  const key = sha1(text);
  const cached = renderCache.get(key);
  if (cached) return cached;
  const html = markdown_to_html(text);
  renderCache.set(key, html);
  return html;
}

export function extractID(
  param: string | string[] | undefined
): number | undefined {
  // if id is null or does not start with an integer, return 404
  if (param == null || typeof param !== "string") return;
  // we support URLs with a slug and id at the end, e.g., "my-title-1234"
  // e.g. https://www.semrush.com/blog/what-is-a-url-slug/
  const idStr = param.split("-").pop();
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 0) return;
  return id;
}
