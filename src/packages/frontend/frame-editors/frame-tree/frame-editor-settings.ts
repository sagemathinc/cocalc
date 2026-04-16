/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useCallback, useRef, useState } from "react";
import useAsyncEffect from "use-async-effect";

import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

import { filename_extension } from "@cocalc/util/misc";
import type { FrameTree } from "./types";

const DKV_NAME = "frame-editor-settings";

interface FrameEditorSettingsChange<T> {
  key?: string;
  value?: T;
}

interface FrameEditorSettingsDKV {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  on(
    event: "change",
    listener: (event: FrameEditorSettingsChange<unknown>) => void,
  ): void;
  close?(): void;
}

export function getFrameEditorSettingsName(
  type: string,
  path?: string,
): string {
  if (path) {
    const ext = filename_extension(path);
    if (ext) {
      return `${type}-${ext.toLowerCase()}`;
    }
  }
  return type;
}

export function getFrameEditorSettingsKey(
  prefix: string,
  editorName: string,
): string {
  return `${prefix}-${editorName}`;
}

function sanitizeToolbarButtons(value: unknown): string[] | null {
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const buttons: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || seen.has(item)) {
      continue;
    }
    seen.add(item);
    buttons.push(item);
  }
  return buttons;
}

function sanitizeToolbarHidden(value: unknown): boolean {
  return value === true;
}

interface UseFrameEditorToolbarButtons {
  initialized: boolean;
  toolbarButtons: string[] | null;
  setToolbarButtons: (value: string[] | null) => void;
  toolbarHidden: boolean;
  setToolbarHidden: (value: boolean) => void;
}

// Migrate legacy toolbar customizations from account.editor_settings.buttons
// (an Immutable Map of {name: boolean} keyed by "ext-type") into the new
// DKV-backed array format. Runs once: if DKV already has data we skip it;
// on any error we write defaults so we never look at the legacy store again.
function migrateLegacyToolbarButtons(
  conatDkv: FrameEditorSettingsDKV,
  storageKey: string,
  legacyEditorType: string | undefined,
): string[] | null {
  // Check if migration already ran for this key (prevents re-importing
  // after a user resets their toolbar).
  const migratedKey = `${storageKey}-migrated`;
  if (conatDkv.get(migratedKey)) {
    return null;
  }
  // Mark migration as done regardless of outcome.
  conatDkv.set(migratedKey, true);

  if (legacyEditorType == null) {
    return null;
  }
  try {
    const editorSettings = redux
      .getStore("account")
      ?.getIn(["editor_settings"]) as any;
    if (editorSettings == null) {
      return null;
    }
    const legacyButtons = editorSettings?.get("buttons")?.get(legacyEditorType);
    if (legacyButtons == null) {
      return null;
    }
    const obj =
      typeof legacyButtons.toJS === "function"
        ? legacyButtons.toJS()
        : legacyButtons;
    const migrated: string[] = [];
    for (const name in obj) {
      if (obj[name]) {
        migrated.push(name);
      }
    }
    if (migrated.length === 0) {
      return null;
    }
    conatDkv.set(storageKey, migrated);
    return migrated;
  } catch {
    return null;
  }
}

// Runtime type guard: validates that an unknown value from the DKV
// is a well-formed FrameTree (leaf, binary node, n-ary node, or tabs node).
function isFrameTree(x: unknown): x is FrameTree {
  if (x == null || typeof x !== "object") return false;
  const t = x as Record<string, unknown>;
  if (typeof t.type !== "string") return false;

  if (t.type === "node") {
    // binary node
    if (t.first != null && t.second != null) {
      return isFrameTree(t.first) && isFrameTree(t.second);
    }
    // n-ary node
    if (Array.isArray(t.children)) {
      return t.children.every(isFrameTree);
    }
    return false;
  }

  if (t.type === "tabs") {
    return Array.isArray(t.children) && t.children.every(isFrameTree);
  }

  // leaf: just needs a type string (already checked above)
  return true;
}

// Keep only the structural layout fields from a frame tree,
// discarding transient fields like id, active_id, font_size, etc.
const LAYOUT_FIELDS = [
  "type",
  "direction",
  "pos",
  "sizes",
  "activeTab",
  "first",
  "second",
  "children",
] as const;

function stripFrameTreeIds(tree: any): any {
  if (tree == null) return tree;
  const result: any = {};
  for (const key of LAYOUT_FIELDS) {
    if (!(key in tree)) continue;
    const val = tree[key];
    if (key === "children" && Array.isArray(val)) {
      result.children = val.map(stripFrameTreeIds);
    } else if (key === "first" && val != null && typeof val === "object") {
      result.first = stripFrameTreeIds(val);
    } else if (key === "second" && val != null && typeof val === "object") {
      result.second = stripFrameTreeIds(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// Save the current frame layout to the DKV for the given file extension.
export async function saveCustomLayout(
  path: string,
  frameTreeJS: object,
): Promise<void> {
  const account = redux.getStore("account");
  const ready = await account.waitUntilReady();
  if (!ready) return;

  const editorName = getFrameEditorSettingsName("layout", path);
  const storageKey = getFrameEditorSettingsKey("custom", editorName);
  const conatDkv = (await webapp_client.conat_client.dkv({
    account_id: account.get_account_id(),
    name: DKV_NAME,
  })) as unknown as FrameEditorSettingsDKV;

  const cleaned = stripFrameTreeIds(frameTreeJS);
  conatDkv.set(storageKey, cleaned);
  conatDkv.close?.();
}

// Load a previously saved custom layout for the given file extension.
// Returns null if none has been saved.
export async function loadCustomLayout(
  path: string,
): Promise<FrameTree | null> {
  const account = redux.getStore("account");
  const ready = await account.waitUntilReady();
  if (!ready) return null;

  const editorName = getFrameEditorSettingsName("layout", path);
  const storageKey = getFrameEditorSettingsKey("custom", editorName);
  const conatDkv = (await webapp_client.conat_client.dkv({
    account_id: account.get_account_id(),
    name: DKV_NAME,
  })) as unknown as FrameEditorSettingsDKV;

  const layout = conatDkv.get(storageKey);
  conatDkv.close?.();

  if (isFrameTree(layout)) {
    return layout;
  }
  return null;
}

// Check whether a custom layout exists for the given file extension.
export async function hasCustomLayout(path: string): Promise<boolean> {
  const layout = await loadCustomLayout(path);
  return layout != null;
}

export function useFrameEditorToolbarButtons(
  editorName: string,
  legacyEditorType?: string,
): UseFrameEditorToolbarButtons {
  const storageKey = getFrameEditorSettingsKey("icons", editorName);
  const hiddenStorageKey = getFrameEditorSettingsKey(
    "icons-hidden",
    editorName,
  );
  const dkvRef = useRef<FrameEditorSettingsDKV | null>(null);
  const toolbarButtonsRef = useRef<string[] | null>(null);
  const toolbarHiddenRef = useRef(false);
  const dirtyRef = useRef(false);
  const [toolbarButtons, setToolbarButtonsState] = useState<string[] | null>(
    null,
  );
  const [toolbarHidden, setToolbarHiddenState] = useState(false);
  const [initialized, setInitialized] = useState(false);

  toolbarButtonsRef.current = toolbarButtons;
  toolbarHiddenRef.current = toolbarHidden;

  const persist = useCallback(
    (value: string[] | null) => {
      const dkv = dkvRef.current;
      if (dkv == null) {
        return;
      }
      if (value == null) {
        dkv.delete(storageKey);
      } else {
        dkv.set(storageKey, value);
      }
    },
    [storageKey],
  );

  const persistHidden = useCallback(
    (value: boolean) => {
      const dkv = dkvRef.current;
      if (dkv == null) {
        return;
      }
      if (!value) {
        dkv.delete(hiddenStorageKey);
      } else {
        dkv.set(hiddenStorageKey, true);
      }
    },
    [hiddenStorageKey],
  );

  const setToolbarButtons = useCallback(
    (value: string[] | null) => {
      const next = sanitizeToolbarButtons(value);
      dirtyRef.current = true;
      toolbarButtonsRef.current = next;
      setToolbarButtonsState(next);
      try {
        persist(next);
      } catch {
        // DKV unavailable.
      }
    },
    [persist],
  );

  const setToolbarHidden = useCallback(
    (value: boolean) => {
      const next = sanitizeToolbarHidden(value);
      dirtyRef.current = true;
      toolbarHiddenRef.current = next;
      setToolbarHiddenState(next);
      try {
        persistHidden(next);
      } catch {
        // DKV unavailable.
      }
    },
    [persistHidden],
  );

  useAsyncEffect(
    async (isMounted) => {
      const account = redux.getStore("account");
      const ready = await account.waitUntilReady();
      if (!ready || !isMounted()) {
        return;
      }

      try {
        const conatDkv = (await webapp_client.conat_client.dkv<string[]>({
          account_id: account.get_account_id(),
          name: DKV_NAME,
        })) as unknown as FrameEditorSettingsDKV;

        if (!isMounted()) {
          conatDkv.close?.();
          return;
        }

        dkvRef.current = conatDkv;
        conatDkv.on("change", ({ key, value }) => {
          if (key === storageKey) {
            const next = sanitizeToolbarButtons(value);
            toolbarButtonsRef.current = next;
            setToolbarButtonsState(next);
          } else if (key === hiddenStorageKey) {
            const next = sanitizeToolbarHidden(value);
            toolbarHiddenRef.current = next;
            setToolbarHiddenState(next);
          }
        });

        if (dirtyRef.current) {
          persist(toolbarButtonsRef.current);
          persistHidden(toolbarHiddenRef.current);
        } else {
          let saved = sanitizeToolbarButtons(conatDkv.get(storageKey));
          if (saved == null) {
            // No DKV data yet — try migrating from legacy account store.
            saved = migrateLegacyToolbarButtons(
              conatDkv,
              storageKey,
              legacyEditorType,
            );
          }
          toolbarButtonsRef.current = saved;
          setToolbarButtonsState(saved);
          const savedHidden = sanitizeToolbarHidden(
            conatDkv.get(hiddenStorageKey),
          );
          toolbarHiddenRef.current = savedHidden;
          setToolbarHiddenState(savedHidden);
        }
      } catch {
        // DKV unavailable.
      } finally {
        if (isMounted()) {
          setInitialized(true);
        }
      }
    },
    () => {
      dkvRef.current?.close?.();
      dkvRef.current = null;
      toolbarButtonsRef.current = null;
      toolbarHiddenRef.current = false;
      dirtyRef.current = false;
      setToolbarButtonsState(null);
      setToolbarHiddenState(false);
      setInitialized(false);
    },
    [hiddenStorageKey, persist, persistHidden, storageKey],
  );

  return {
    initialized,
    toolbarButtons,
    setToolbarButtons,
    toolbarHidden,
    setToolbarHidden,
  };
}
