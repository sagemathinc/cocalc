/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export interface PublicPath {
  id: string;
  path?: string;
  url?: string;
  description?: string;
  last_edited?: number;
  disabled?: boolean;
  unlisted?: boolean;
  authenticated?: boolean;
  vhost?: string;
  counter?: number;
  stars?: number;
  avatar_image_tiny?: string;
}

// This is because of Type error: 'types.ts' cannot be compiled under '--isolatedModules' because it is considered a
// global script file. Add an import, export, or an empty 'export {}' statement to make it a module.
export default {};
