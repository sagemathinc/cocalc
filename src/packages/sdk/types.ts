export type BuiltinIconName = string;

export type IconRef =
  | BuiltinIconName
  | { type: "bundle"; uri: string }
  | { type: "external"; url: string };

export type CommandSet = { [name: string]: boolean };
export type CommandSetInput = readonly string[] | CommandSet;

export interface ExtensionFrameLeaf {
  type: string;
  font_size?: number;
}

export interface ExtensionFrameNode {
  type: "node";
  direction?: "row" | "col";
  first?: ExtensionFrameTree;
  second?: ExtensionFrameTree;
  children?: ExtensionFrameTree[];
  sizes?: number[];
  pos?: number;
}

export interface ExtensionTabsFrameNode {
  type: "tabs";
  children: ExtensionFrameTree[];
  activeTab?: number;
}

export type ExtensionFrameTree =
  | ExtensionFrameLeaf
  | ExtensionFrameNode
  | ExtensionTabsFrameNode;

export interface ExtensionSyncSpec {
  doctype: "syncstring" | "syncdb" | "none";
  primaryKeys?: string[];
  stringCols?: string[];
}

export interface ExtensionFrameDefinitionInput {
  short: string;
  name: string;
  icon?: IconRef;
  component: unknown;
  commands?: CommandSetInput;
  customizeCommands?: { [commandName: string]: unknown };
  buttons?: CommandSetInput;
}

export interface ExtensionFrameDefinition extends Omit<
  ExtensionFrameDefinitionInput,
  "commands" | "buttons"
> {
  type: string;
  commands?: CommandSet;
  buttons?: CommandSet;
}

export type ExtensionSource = "builtin" | "admin";

export interface BaseExtensionDefinitionInput {
  id: string;
  name: string;
  version?: string;
  main?: string;
  source?: ExtensionSource;
  icon?: IconRef;
  priority?: number;
}

export interface BaseExtensionDefinition extends Omit<
  BaseExtensionDefinitionInput,
  "source"
> {
  source: ExtensionSource;
}

export interface EditorExtensionDefinitionInput extends BaseExtensionDefinitionInput {
  extensions?: string[];
  filenames?: string[];
  nativeFrames?: string[];
  frames: Record<string, ExtensionFrameDefinitionInput>;
  defaultLayout?: ExtensionFrameTree;
  sync?: ExtensionSyncSpec;
  actions?: unknown;
}

export interface EditorExtensionDefinition extends BaseExtensionDefinition {
  kind: "editor";
  extensions: string[];
  filenames: string[];
  nativeFrames: string[];
  frames: Record<string, ExtensionFrameDefinition>;
  defaultLayout?: ExtensionFrameTree;
  sync?: ExtensionSyncSpec;
  actions?: unknown;
}

export interface FrameExtensionDefinitionInput extends BaseExtensionDefinitionInput {
  targetEditors: string[];
  frame: Omit<ExtensionFrameDefinitionInput, "type"> & { type: string };
}

export interface FrameExtensionDefinition extends BaseExtensionDefinition {
  kind: "frame";
  targetEditors: string[];
  frame: ExtensionFrameDefinition;
}

export type ExtensionDefinitionInput =
  | EditorExtensionDefinitionInput
  | FrameExtensionDefinitionInput;

export type ExtensionDefinition =
  | EditorExtensionDefinition
  | FrameExtensionDefinition;

export interface ExtensionRegistrationApi {
  register(extension: ExtensionDefinition): void;
  unregister?(id: string): void;
  list?(): ExtensionDefinition[];
}
