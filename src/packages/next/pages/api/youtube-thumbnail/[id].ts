/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Server-side proxy for YouTube video thumbnails. The click-to-load video
// gate (components/videos.tsx) uses this so visitors see a still image
// without their browser contacting i.ytimg.com / Google before they have
// explicitly consented to YouTube embeds.
//
// Thumbnails are effectively immutable per id, so we cache aggressively at
// the CDN / browser layer. We do not buffer in-process — Next.js / the
// upstream proxy handles concurrency fine, and adding a per-process LRU
// here would complicate cold start without measurable wins.

import type { NextApiRequest, NextApiResponse } from "next";

// YouTube video ids are 11 chars of [A-Za-z0-9_-]. Be slightly lenient
// (6-20) so a future id-length change doesn't silently break the page,
// while still rejecting obvious junk that would just produce a 404.
const ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

// hqdefault is 480x360 with letterboxing for 16:9 sources — good enough
// for the carousel at 672px wide and always present. mqdefault is the
// fallback for the rare id where hqdefault is missing.
const VARIANTS = ["hqdefault", "mqdefault"] as const;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const id = String(req.query.id ?? "");
  if (!ID_RE.test(id)) {
    res.status(400).send("invalid id");
    return;
  }
  for (const variant of VARIANTS) {
    const url = `https://i.ytimg.com/vi/${id}/${variant}.jpg`;
    let upstream: Response;
    try {
      upstream = await fetch(url);
    } catch (err) {
      // Network blip; try next variant before giving up. We don't log
      // every failure — a misconfigured firewall would otherwise flood
      // the hub logs with one entry per page view.
      continue;
    }
    if (!upstream.ok) continue;
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("content-type", "image/jpeg");
    res.setHeader(
      "cache-control",
      "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
    );
    res.status(200).send(buf);
    return;
  }
  res.status(404).send("not found");
}
