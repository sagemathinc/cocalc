/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export interface SSO {
  id: string; // the strategy id
  display: string; // short string, should be recognizable for the user
  domains: string[]; // empty, or list of domains for exclusive usage
  descr: string; // sent through the markdown component
  icon?: string; // a URL
  backgroundColor?: string; // a hex color
}
