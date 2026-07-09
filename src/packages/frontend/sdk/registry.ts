import type {
  EditorExtensionDefinition,
  ExtensionDefinition,
  FrameExtensionDefinition,
} from "@cocalc/sdk";
import {
  consumePendingExtensions,
  setExtensionRegistrationApi,
} from "@cocalc/sdk";

import { resolve_file_type } from "@cocalc/frontend/file-associations";

import {
  fileTypeKeysForEditorExtension,
  resolveEditorExtension,
} from "./resolve";
import type {
  ExtensionRegistry,
  ExtensionRegistryListener,
  RegisteredExtension,
  ResolveEditorExtensionOptions,
  ResolvedEditorExtension,
} from "./types";

class LiveExtensionRegistry implements ExtensionRegistry {
  private registeredAt = 0;
  private readonly byId = new Map<string, RegisteredExtension>();
  private readonly editorsByFileKey = new Map<
    string,
    RegisteredExtension<EditorExtensionDefinition>[]
  >();
  private readonly framesByEditorId = new Map<
    string,
    RegisteredExtension<FrameExtensionDefinition>[]
  >();
  private readonly listeners = new Set<ExtensionRegistryListener>();

  constructor() {
    setExtensionRegistrationApi(this);
    consumePendingExtensions((extension) => {
      this.register(extension);
    });
  }

  register(extension: ExtensionDefinition): void {
    const existing = this.byId.get(extension.id);
    if (existing != null) {
      this.removeIndexes(existing);
    }
    const registered: RegisteredExtension = {
      definition: extension,
      registeredAt: ++this.registeredAt,
    };
    this.byId.set(extension.id, registered);
    this.addIndexes(registered);
    this.emit({ type: "registered", extension: registered });
  }

  unregister(id: string): void {
    const existing = this.byId.get(id);
    if (existing == null) {
      return;
    }
    this.byId.delete(id);
    this.removeIndexes(existing);
    this.emit({ type: "unregistered", extension: existing });
  }

  get(id: string): RegisteredExtension | undefined {
    return this.byId.get(id);
  }

  list(): ExtensionDefinition[] {
    return this.listRegistered().map(({ definition }) => definition);
  }

  listRegistered(): RegisteredExtension[] {
    return [...this.byId.values()].sort(
      (left, right) => left.registeredAt - right.registeredAt,
    );
  }

  getEditorCandidatesForFileKey(
    fileKey: string,
  ): RegisteredExtension<EditorExtensionDefinition>[] {
    return [...(this.editorsByFileKey.get(fileKey) ?? [])];
  }

  getEditorCandidatesForPath(
    path: string,
    ext?: string,
  ): RegisteredExtension<EditorExtensionDefinition>[] {
    return this.getEditorCandidatesForFileKey(resolve_file_type(path, ext).key);
  }

  getFrameCandidatesForEditor(
    editorId: string,
  ): RegisteredExtension<FrameExtensionDefinition>[] {
    return [...(this.framesByEditorId.get(editorId) ?? [])];
  }

  resolveEditor(
    candidates: RegisteredExtension<EditorExtensionDefinition>[],
    options: ResolveEditorExtensionOptions = {},
  ): ResolvedEditorExtension | undefined {
    return resolveEditorExtension(candidates, options);
  }

  subscribe(listener: ExtensionRegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: {
    type: "registered" | "unregistered";
    extension: RegisteredExtension;
  }): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private addIndexes(registered: RegisteredExtension): void {
    if (registered.definition.kind === "editor") {
      const editor =
        registered as RegisteredExtension<EditorExtensionDefinition>;
      for (const key of fileTypeKeysForEditorExtension(editor.definition)) {
        this.editorsByFileKey.set(key, [
          ...(this.editorsByFileKey.get(key) ?? []).filter(
            (candidate) => candidate.definition.id !== editor.definition.id,
          ),
          editor,
        ]);
      }
      return;
    }
    const frame = registered as RegisteredExtension<FrameExtensionDefinition>;
    for (const editorId of frame.definition.targetEditors) {
      this.framesByEditorId.set(editorId, [
        ...(this.framesByEditorId.get(editorId) ?? []).filter(
          (candidate) => candidate.definition.id !== frame.definition.id,
        ),
        frame,
      ]);
    }
  }

  private removeIndexes(registered: RegisteredExtension): void {
    if (registered.definition.kind === "editor") {
      const editor =
        registered as RegisteredExtension<EditorExtensionDefinition>;
      for (const key of fileTypeKeysForEditorExtension(editor.definition)) {
        const next = (this.editorsByFileKey.get(key) ?? []).filter(
          (candidate) => candidate.definition.id !== editor.definition.id,
        );
        if (next.length > 0) {
          this.editorsByFileKey.set(key, next);
        } else {
          this.editorsByFileKey.delete(key);
        }
      }
      return;
    }
    const frame = registered as RegisteredExtension<FrameExtensionDefinition>;
    for (const editorId of frame.definition.targetEditors) {
      const next = (this.framesByEditorId.get(editorId) ?? []).filter(
        (candidate) => candidate.definition.id !== frame.definition.id,
      );
      if (next.length > 0) {
        this.framesByEditorId.set(editorId, next);
      } else {
        this.framesByEditorId.delete(editorId);
      }
    }
  }
}

export const extensionRegistry: ExtensionRegistry = new LiveExtensionRegistry();
