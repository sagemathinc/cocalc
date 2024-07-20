/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import LRU from "lru-cache";

import type { KernelSpec } from "@cocalc/jupyter/types";
import { capitalize } from "@cocalc/util/misc";
import api from "./api";

const kernelInfoCache = new LRU<string, KernelSpec[]>({
  ttl: 30000,
  max: 50,
});

function kernelInfoCacheKey(project_id: string | undefined) {
  return project_id ?? "global";
}

export function getKernelInfoCacheOnly(project_id: string | undefined) {
  const kernelInfo = kernelInfoCache.get(kernelInfoCacheKey(project_id));
  if (kernelInfo != null) return kernelInfo;
  (async () => {
    try {
      await getKernelInfo(project_id); // refresh cache
    } catch (err) {
      // e.g., if you user isn't signed in and project_id is set, this will fail, but shouldn't be fatal.
      console.warn(`WARNING: ${err}`);
    }
  })();
}

export async function getKernelInfo(
  project_id: string | undefined,
  startProject: boolean = true,
): Promise<KernelSpec[]> {
  const key = kernelInfoCacheKey(project_id);
  let specs = kernelInfoCache.get(key);
  if (specs != null) return specs;

  // abort here, if we don't want to trigger a project start
  if (!startProject) {
    throw new Error("No information, because project is not running");
  }

  const { kernels } = await api(
    "kernels",
    project_id ? { project_id } : undefined,
  );
  if (kernels == null) {
    throw Error("bug");
  }
  kernelInfoCache.set(key, kernels);
  return kernels;
}

export function kernelDisplayName(
  name: string,
  project_id: string | undefined,
): string {
  const kernelInfo = getKernelInfoCacheOnly(project_id);
  if (kernelInfo == null) {
    return capitalize(name);
  }
  for (const k of kernelInfo) {
    if (k.name == name) {
      return k.display_name;
    }
  }
  return capitalize(name);
}

export function kernelLanguage(
  name: string,
  project_id: string | undefined,
): string {
  const kernelInfo = getKernelInfoCacheOnly(project_id);
  if (kernelInfo == null) {
    return name;
  }
  for (const k of kernelInfo) {
    if (k.name == name) {
      return k.language;
    }
  }
  return name;
}
