/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ReactNode } from "react";

import { IconName, IconRotation } from "@cocalc/frontend/components/icon";
import { StudentProjectFunctionality } from "@cocalc/util/db-schema/projects";
import { IntlMessage } from "@cocalc/frontend/i18n";
import type { ManageCommands } from "./manage";
import { MENUS } from "./menus";

// Specification for a single menu in the frame title bar.
interface MenuSpec {
  // Display label for the menu. Can be translated text or special APPLICATION_MENU constant
  label: IntlMessage | string;

  // Position for menu ordering. Lower numbers appear first
  pos: number;

  // Array of group names that belong to this menu. Groups contain the actual commands.
  groups: string[];
}

/**
 * Collection of all menu specifications. Menus are registered via addMenus()
 * in generic-menus.ts and define the top-level dropdown structure in frame title bars.
 * Examples: "file", "edit", "view", "go", "help", "app"
 */
export interface Menus {
  [name: string]: MenuSpec;
}

export type Group = (typeof MENUS)[keyof typeof MENUS]["groups"][number];

/**
 * Function signature for command click handlers. Receives the ManageCommands
 * instance (providing access to frame context, props, etc.) and an optional
 * event object from the UI interaction.
 */
export type OnClick = (opts: ManageCommands & { event? }) => void;

/**
 * Configuration options for Ant Design Popconfirm modal dialogs.
 * Used to show confirmation prompts before executing potentially destructive commands.
 * All fields support internationalization via IntlMessage.
 */
interface PopconfirmOpts {
  // Main title text shown at the top of the confirmation dialog
  title?: string | IntlMessage | React.JSX.Element;
  // Detailed description explaining the action and its consequences
  description?: string | IntlMessage | React.JSX.Element;
  // Text for the confirmation button (defaults to "OK")
  okText?: string | IntlMessage;
  // Text for the cancel button (defaults to "Cancel")
  cancelText?: string | IntlMessage;
}

/**
 * Type for command text fields (title, label, button) that can be:
 * - A static ReactNode
 * - A static IntlMessage for internationalization
 * - A function that returns either ReactNode or IntlMessage based on context
 */
export type CommandText =
  | ReactNode
  | IntlMessage
  | ((opts: ManageCommands) => ReactNode | IntlMessage);

/**
 * Defines a command that can appear in frame editor menus, toolbars, and buttons.
 * For example, split frame, zoom, save, etc.
 *
 * Commands are organized into menus via groups.
 * Each editor (LaTeX, code, etc.) can include specific commands in their EditorDescription.commands.
 *
 * The ManageCommands class handles visibility, rendering, and execution of commands
 * based on the current frame context, user permissions, and editor specifications.
 */
export interface Command {
  /**
   * The menu group this command belongs to.
   * Commands are organized into groups for logical menu structure.
   */
  group: Group;

  /**
   * Used in menu construction helpers (e.g., addEditorMenus) to identify
   * commands within the menu system. Not used in the final Command objects
   * that get registered, which are identified by their key in the commands object.
   */
  name?: string;

  /**
   * Position within the group for sorting. Lower numbers appear first.
   * Used by ManageCommands.getAllCommandPositions() to determine display order
   * in menus and toolbars. Defaults to 1e6 (very high) if not specified.
   */
  pos?: number;

  // Tooltip text shown when hovering over the command
  title?: CommandText;

  // Icon to display for this command.
  icon?: IconName | ReactNode | ((opts: ManageCommands) => ReactNode);

  // Rotation angle for the icon in degrees. Only applies when icon is an IconName.
  iconRotate?: IconRotation;

  // Label for button bar buttons. Separate from 'label' to allow different text in menus vs. compact button bar.
  button?: CommandText;

  // unclear?
  //color?: string | ((opts: ManageCommands) => string);

  // Primary label for the command in menus.
  label?: CommandText;

  /**
   * Click handler for the command. If not provided, the system falls back to
   * calling props.actions[name](props.id) where 'name' is the command key.
   * Receives ManageCommands context plus an optional 'event' parameter.
   */
  onClick?: OnClick;

  /**
   * Controls command visibility.
   * Used to conditionally show commands based on frame type, file type, etc.
   * Can be a string (references another command name in the editor spec) or a function
   * NOTE: Completely ignored if alwaysShow is true
   */
  isVisible?: string | (({ props }) => boolean);

  /**
   * Disables the command when the specified student project functionality
   * is disabled. References keys in studentProjectFunctionality object.
   * Used in educational contexts to restrict certain features.
   */
  disable?: keyof StudentProjectFunctionality;

  /**
   * Keyboard shortcut display. Shown in menu items on desktop (not mobile).
   * Should match actual keyboard shortcuts defined elsewhere in the app.
   */
  keyboard?: ReactNode;

  // Sub-commands that appear as a submenu.
  children?:
    | Partial<Command>[]
    | ((opts: ManageCommands) => Partial<Command>[]);

  // if this returns true, the command should be disabled (grayed out) but still visible
  disabled?: (opts: ManageCommands) => boolean;

  // for interactive tours -- not used yet
  tour?: string;

  // do modal popconfirm first -- takes options to antd
  // Popconfirm, or a function that returns Popconfirm options.
  // See frontend/app/popconfirm-modal.tsx for subtleties.
  popconfirm?:
    | PopconfirmOpts
    | ((opts: ManageCommands) => PopconfirmOpts | undefined);

  /**
   * If true, this command is never shown on mobile devices.
   * Used for commands that don't work well on touch interfaces or
   * are not needed in mobile contexts.
   */
  neverVisibleOnMobile?: boolean;

  /**
   * If true, forces the command to always be visible, overriding all other
   * visibility checks including isVisible functions and editor spec requirements.
   * Used for essential commands like frame controls that should always be available.
   * Takes precedence over neverVisibleOnMobile.
   */
  alwaysShow?: boolean;

  /**
   * If true, keeps dropdown menus open after clicking this command.
   * Used for commands that don't navigate away or change context,
   * allowing multiple selections (e.g., zoom level changes).
   */
  stayOpenOnClick?: boolean;

  /**
   * Additional search terms for the command search functionality.
   * Used by the search_commands feature to find commands beyond their
   * title, label, and name. Improves discoverability.
   */
  search?: string;
}
