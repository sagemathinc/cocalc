/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import LRU from "lru-cache";

// no TTL, since a given text never changes its rendered representation
const renderCache = new LRU<string, string>({ max: 1000 });

import { sha1 } from "@cocalc/backend/sha1";
import { markdown_to_html } from "@cocalc/frontend/markdown";

export function renderMarkdown(text: string): string {
  // hash of text
  const key = sha1(text);
  const cached = renderCache.get(key);
  if (cached) return cached;
  const html = markdown_to_html(text);
  renderCache.set(key, html);
  return html;
}
