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

const PROJECT_EDITOR_EXTENSIONS_DKV = "editor-extensions";
const PROJECT_EDITOR_EXTENSIONS_CONFIG_KEY = "config";

export interface InstalledProjectEditorExtension {
  id: string;
  bundleUrl: string;
  enabled?: boolean;
}

export interface ProjectEditorExtensionSettings {
  extra_frames?: string[];
  options?: Record<string, unknown>;
}

export interface ProjectEditorExtensionsConfig {
  file_mappings?: Record<string, string>;
  installed?: InstalledProjectEditorExtension[];
  editor_settings?: Record<string, ProjectEditorExtensionSettings>;
}

interface ProjectEditorExtensionsChange {
  key?: string;
  value?: ProjectEditorExtensionsConfig;
}

interface ProjectEditorExtensionsDKV {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  on(
    event: "change",
    listener: (event: ProjectEditorExtensionsChange) => void,
  ): void;
  removeListener?(
    event: "change",
    listener: (event: ProjectEditorExtensionsChange) => void,
  ): void;
  close?(): void;
}

type ProjectEditorConfigListener = (
  config: ProjectEditorExtensionsConfig,
) => void;

function normalizeInstalled(
  value: unknown,
): InstalledProjectEditorExtension[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const installed: InstalledProjectEditorExtension[] = [];
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
): Record<string, ProjectEditorExtensionSettings> | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  const normalized: Record<string, ProjectEditorExtensionSettings> = {};
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

export function normalizeProjectEditorExtensionsConfig(
  value: unknown,
): ProjectEditorExtensionsConfig {
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

export function getProjectEditorConfig(
  project_id: string,
): ProjectEditorExtensionsConfig {
  const storeConfig = redux
    .getProjectStore(project_id)
    ?.get("extension_config");
  const storeValue =
    typeof storeConfig?.toJS === "function" ? storeConfig.toJS() : storeConfig;
  return normalizeProjectEditorExtensionsConfig(storeValue);
}

export function getProjectEditorId(
  project_id: string | undefined,
  fileKey: string | undefined,
): string | undefined {
  if (project_id == null || fileKey == null) {
    return;
  }
  return getProjectEditorConfig(project_id).file_mappings?.[
    canonical_extension(fileKey)
  ];
}

export async function saveProjectEditorConfig(
  project_id: string,
  config: ProjectEditorExtensionsConfig,
): Promise<void> {
  const dkv =
    (await webapp_client.conat_client.dkv<ProjectEditorExtensionsConfig>({
      project_id,
      name: PROJECT_EDITOR_EXTENSIONS_DKV,
    })) as unknown as ProjectEditorExtensionsDKV;
  try {
    dkv.set(
      PROJECT_EDITOR_EXTENSIONS_CONFIG_KEY,
      normalizeProjectEditorExtensionsConfig(config),
    );
  } finally {
    dkv.close?.();
  }
}

export async function openProjectEditorConfig(
  project_id: string,
  onChange: ProjectEditorConfigListener,
): Promise<() => void> {
  const account = redux.getStore("account");
  const ready = await account?.waitUntilReady?.();
  if (ready === false) {
    return () => {};
  }
  const dkv = (await retry_until_success({
    f: async () =>
      (await withTimeout(
        webapp_client.conat_client.dkv<ProjectEditorExtensionsConfig>({
          project_id,
          name: PROJECT_EDITOR_EXTENSIONS_DKV,
        }),
        15000,
      )) as unknown as ProjectEditorExtensionsDKV,
    max_time: 60000,
    max_delay: 5000,
    desc: `open project editor extensions dkv for ${project_id}`,
  })) as ProjectEditorExtensionsDKV;
  const emit = (value: unknown) => {
    onChange(normalizeProjectEditorExtensionsConfig(value));
  };
  emit(dkv.get(PROJECT_EDITOR_EXTENSIONS_CONFIG_KEY));
  const listener = (event: ProjectEditorExtensionsChange) => {
    if (event.key !== PROJECT_EDITOR_EXTENSIONS_CONFIG_KEY) {
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

export function useProjectEditorConfig(
  project_id: string,
): ProjectEditorExtensionsConfig | undefined {
  return useTypedRedux({ project_id }, "extension_config");
}

export function useProjectEditorExtensions(project_id: string): void {
  const config = useProjectEditorConfig(project_id);

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
