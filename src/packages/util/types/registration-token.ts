/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Customization settings that can be applied via registration tokens.
 * These settings restrict or modify the behavior of accounts and their projects.
 */
export interface RegistrationTokenCustomize {
  /**
   * If true, prevents users from adding collaborators to their projects.
   * The "Add Collaborators" UI will be hidden.
   */
  disableCollaborators?: boolean;

  /**
   * If true, disables all AI/language model features for this account.
   */
  disableAI?: boolean;

  /**
   * If true, disables internet access for projects created by this account.
   * This is enforced at the project level via project settings.
   */
  disableInternet?: boolean;

  /**
   * Optional site license ID to apply to projects created via this token.
   */
  license?: string;
}

// Backwards compatibility alias
export type EphemeralCustomize = RegistrationTokenCustomize;
