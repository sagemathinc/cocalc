/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect } from "react";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { canonical_extension } from "@cocalc/frontend/file-associations";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { retry_until_success, withTimeout } from "@cocalc/util/async-utils";
import { loadExtensionBundle } from "./loader";

const PROJECT_SDK_DKV = "sdk-bundles";
const PROJECT_SDK_CONFIG_KEY = "config";

export interface InstalledSdkBundle {
  id: string;
  bundleUrl: string;
  enabled?: boolean;
}

export interface SdkBundleSettings {
  extra_frames?: string[];
  options?: Record<string, unknown>;
}

export interface ProjectSdkConfig {
  file_mappings?: Record<string, string>;
  installed?: InstalledSdkBundle[];
  editor_settings?: Record<string, SdkBundleSettings>;
}

interface ProjectSdkConfigChange {
  key?: string;
  value?: ProjectSdkConfig;
}

interface ProjectSdkDKV {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  on(
    event: "change",
    listener: (event: ProjectSdkConfigChange) => void,
  ): void;
  removeListener?(
    event: "change",
    listener: (event: ProjectSdkConfigChange) => void,
  ): void;
  close?(): void;
}

type ProjectSdkConfigListener = (
  config: ProjectSdkConfig,
) => void;

function normalizeInstalled(
  value: unknown,
): InstalledSdkBundle[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const installed: InstalledSdkBundle[] = [];
  for (const item of value) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const id = (item as { id?: unknown }).id;
    const bundleUrl = (item as { bundleUrl?: unknown }).bundleUrl;
    if (typeof id !== "string" || id === "") {
      continue;
    }
    if (typeof bundleUrl !== "string" || bundleUrl === "") {
      continue;
    }
    installed.push({
      id,
      bundleUrl,
      enabled: (item as { enabled?: unknown }).enabled !== false,
    });
  }
  return installed;
}

function normalizeFileMappings(
  value: unknown,
): Record<string, string> | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  const normalized: Record<string, string> = {};
  for (const [key, editorId] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (typeof editorId !== "string" || editorId === "") {
      continue;
    }
    normalized[canonical_extension(key)] = editorId;
  }
  return normalized;
}

function normalizeEditorSettings(
  value: unknown,
): Record<string, SdkBundleSettings> | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  const normalized: Record<string, SdkBundleSettings> = {};
  for (const [editorId, settings] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (typeof editorId !== "string" || editorId === "") {
      continue;
    }
    if (
      settings == null ||
      typeof settings !== "object" ||
      Array.isArray(settings)
    ) {
      continue;
    }
    const raw = settings as {
      extra_frames?: unknown;
      options?: unknown;
    };
    normalized[editorId] = {
      extra_frames: Array.isArray(raw.extra_frames)
        ? raw.extra_frames.filter(
            (frameId): frameId is string =>
              typeof frameId === "string" && frameId !== "",
          )
        : undefined,
      options:
        raw.options != null &&
        typeof raw.options === "object" &&
        !Array.isArray(raw.options)
          ? (raw.options as Record<string, unknown>)
          : undefined,
    };
  }
  return normalized;
}

export function normalizeProjectSdkConfig(
  value: unknown,
): ProjectSdkConfig {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const raw = value as {
    file_mappings?: unknown;
    installed?: unknown;
    editor_settings?: unknown;
  };
  return {
    file_mappings: normalizeFileMappings(raw.file_mappings),
    installed: normalizeInstalled(raw.installed),
    editor_settings: normalizeEditorSettings(raw.editor_settings),
  };
}

export function getProjectSdkConfig(
  project_id: string,
): ProjectSdkConfig {
  const storeConfig = redux
    .getProjectStore(project_id)
    ?.get("sdk_config");
  const storeValue =
    typeof storeConfig?.toJS === "function" ? storeConfig.toJS() : storeConfig;
  return normalizeProjectSdkConfig(storeValue);
}

export function getProjectEditorId(
  project_id: string | undefined,
  fileKey: string | undefined,
): string | undefined {
  if (project_id == null || fileKey == null) {
    return;
  }
  return getProjectSdkConfig(project_id).file_mappings?.[
    canonical_extension(fileKey)
  ];
}

export async function saveProjectSdkConfig(
  project_id: string,
  config: ProjectSdkConfig,
): Promise<void> {
  const dkv =
    (await webapp_client.conat_client.dkv<ProjectSdkConfig>({
      project_id,
      name: PROJECT_SDK_DKV,
    })) as unknown as ProjectSdkDKV;
  try {
    dkv.set(
      PROJECT_SDK_CONFIG_KEY,
      normalizeProjectSdkConfig(config),
    );
  } finally {
    dkv.close?.();
  }
}

export async function openProjectSdkConfig(
  project_id: string,
  onChange: ProjectSdkConfigListener,
): Promise<() => void> {
  const account = redux.getStore("account");
  const ready = await account?.waitUntilReady?.();
  if (ready === false) {
    return () => {};
  }
  const dkv = (await retry_until_success({
    f: async () =>
      (await withTimeout(
        webapp_client.conat_client.dkv<ProjectSdkConfig>({
          project_id,
          name: PROJECT_SDK_DKV,
        }),
        15000,
      )) as unknown as ProjectSdkDKV,
    max_time: 60000,
    max_delay: 5000,
    desc: `open project editor extensions dkv for ${project_id}`,
  })) as ProjectSdkDKV;
  const emit = (value: unknown) => {
    onChange(normalizeProjectSdkConfig(value));
  };
  emit(dkv.get(PROJECT_SDK_CONFIG_KEY));
  const listener = (event: ProjectSdkConfigChange) => {
    if (event.key !== PROJECT_SDK_CONFIG_KEY) {
      return;
    }
    emit(event.value);
  };
  dkv.on("change", listener);
  return () => {
    dkv.removeListener?.("change", listener);
    dkv.close?.();
  };
}

export function useProjectSdkConfig(
  project_id: string,
): ProjectSdkConfig | undefined {
  return useTypedRedux({ project_id }, "sdk_config");
}

export function useProjectSdkBundles(project_id: string): void {
  const config = useProjectSdkConfig(project_id);

  useEffect(() => {
    let active = true;
    (async () => {
      const installed = config?.installed ?? [];
      for (const extension of installed) {
        if (!active || extension.enabled === false) {
          continue;
        }
        try {
          await loadExtensionBundle(extension.bundleUrl);
        } catch (err) {
          console.warn(
            `Failed to load extension bundle "${extension.id}" for project ${project_id}: ${err}`,
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [project_id, JSON.stringify(config?.installed ?? [])]);
}
