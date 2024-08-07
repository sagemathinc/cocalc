/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { SiteLicense } from "@cocalc/util/types/site-licenses";
import { List, Map, Set } from "immutable";
import { TypedMap } from "../../app-framework";

// TODO: these fields do not match src/packages/util/upgrades/types.ts
// what are they?
export const upgrade_fields = [
  "cores",
  "cpu_shares",
  "disk_quota",
  "member_host",
  "memory_request",
  "memory",
  "mintime",
  "network",
] as const;

export type upgrade_fields_type = typeof upgrade_fields[number];

export function isUpgradFieldsType(
  field: string
): field is upgrade_fields_type {
  return (upgrade_fields as unknown as string[]).indexOf(field) >= 0;
}

export type Upgrades = { [field in upgrade_fields_type]: number };

export type license_field_type =
  | "string"
  | "paragraph"
  | "date"
  | "account_id[]"
  | "map"
  | "boolean"
  | "upgrades"
  | "quota"
  | "number"
  | "readonly";

export type license_field_names =
  | "id"
  | "title"
  | "description"
  | "info"
  | "expires"
  | "activates"
  | "created"
  | "last_used"
  | "managers"
  // | "restricted" // hide for now since not implemented at all
  | "upgrades"
  | "quota"
  | "run_limit";
// | "apply_limit" // hide for now since not implemented at all

export const license_fields: {
  [field in license_field_names]: license_field_type;
} = {
  id: "readonly",
  title: "string",
  description: "paragraph",
  info: "map",
  expires: "date",
  activates: "date",
  created: "date",
  last_used: "date",
  managers: "account_id[]",
  // restricted: "boolean",  // hide for now since not implemented at all
  upgrades: "upgrades",
  quota: "quota",
  run_limit: "number",
  //apply_limit: "number" // hide for now since not implemented at all
};

// export const source_fields = ["expires", "activates", "created", "last_used"];

export type ManagerInfo = TypedMap<{
  license_id: string;
  account_id: string;
  email_address?: string;
  first_name?: string;
  last_name?: string;
  created?: Date;
  last_active?: Date;
}>;

export interface SiteLicensesState {
  view?: boolean; // if true, open for viewing/editing
  error?: string;
  loading?: boolean;
  creating?: boolean;
  site_licenses?: List<TypedMap<SiteLicense>>; // licenses that match the search
  editing?: Set<string>; // id's of site licenses that are currently being edited.
  saving?: Set<string>; // id's of site licenses that are currently being saved to the backend.
  show_projects?: Map<string, Date | "now">; // id's where we should show the projects that are using the license and what cutoff date
  edits?: Map<string, TypedMap<SiteLicense>>;
  search?: string;
  usage_stats?: Map<string, number>; // {license_id:number of running projects using that license}
  manager_info?: ManagerInfo; // if given, show more info about this manager
}
