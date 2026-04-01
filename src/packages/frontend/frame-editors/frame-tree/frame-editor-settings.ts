/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useCallback, useRef, useState } from "react";
import useAsyncEffect from "use-async-effect";

import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

import { filename_extension } from "@cocalc/util/misc";

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

export function getFrameEditorSettingsName(type: string, path?: string): string {
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

interface UseFrameEditorToolbarButtons {
  initialized: boolean;
  toolbarButtons: string[] | null;
  setToolbarButtons: (value: string[] | null) => void;
}

export function useFrameEditorToolbarButtons(
  editorName: string,
): UseFrameEditorToolbarButtons {
  const storageKey = getFrameEditorSettingsKey("icons", editorName);
  const dkvRef = useRef<FrameEditorSettingsDKV | null>(null);
  const toolbarButtonsRef = useRef<string[] | null>(null);
  const dirtyRef = useRef(false);
  const [toolbarButtons, setToolbarButtonsState] = useState<string[] | null>(
    null,
  );
  const [initialized, setInitialized] = useState(false);

  toolbarButtonsRef.current = toolbarButtons;

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
          if (key !== storageKey) {
            return;
          }
          const next = sanitizeToolbarButtons(value);
          toolbarButtonsRef.current = next;
          setToolbarButtonsState(next);
        });

        if (dirtyRef.current) {
          persist(toolbarButtonsRef.current);
        } else {
          const saved = sanitizeToolbarButtons(conatDkv.get(storageKey));
          toolbarButtonsRef.current = saved;
          setToolbarButtonsState(saved);
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
      dirtyRef.current = false;
      setToolbarButtonsState(null);
      setInitialized(false);
    },
    [persist, storageKey],
  );

  return { initialized, toolbarButtons, setToolbarButtons };
}
