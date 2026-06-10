import type {
  EditorExtensionDefinition,
  ExtensionDefinition,
  ExtensionRegistrationApi,
  FrameExtensionDefinition,
} from "@cocalc/sdk";

export interface RegisteredExtension<
  T extends ExtensionDefinition = ExtensionDefinition,
> {
  definition: T;
  registeredAt: number;
}

export type ExtensionRegistryEvent =
  | { type: "registered"; extension: RegisteredExtension }
  | { type: "unregistered"; extension: RegisteredExtension };

export type ExtensionRegistryListener = (event: ExtensionRegistryEvent) => void;

export interface ResolveEditorExtensionOptions {
  editorId?: string;
  userEditorId?: string;
  projectEditorId?: string;
  builtinEditorId?: string;
}

export type ResolveEditorExtensionReason =
  | "editorId"
  | "user"
  | "project"
  | "priority"
  | "builtin"
  | "latest";

export interface ResolvedEditorExtension {
  extension: RegisteredExtension<EditorExtensionDefinition>;
  reason: ResolveEditorExtensionReason;
}

export interface ExtensionRegistry extends ExtensionRegistrationApi {
  get(id: string): RegisteredExtension | undefined;
  getEditorCandidatesForFileKey(
    fileKey: string,
  ): RegisteredExtension<EditorExtensionDefinition>[];
  getFrameCandidatesForEditor(
    editorId: string,
  ): RegisteredExtension<FrameExtensionDefinition>[];
  list(): ExtensionDefinition[];
  listRegistered(): RegisteredExtension[];
  resolveEditor(
    candidates: RegisteredExtension<EditorExtensionDefinition>[],
    options?: ResolveEditorExtensionOptions,
  ): ResolvedEditorExtension | undefined;
  subscribe(listener: ExtensionRegistryListener): () => void;
  unregister(id: string): void;
}
