import { Map, Set } from "immutable";
import { TypedMap } from "../../app-framework";

export type upgrade_fields_type =
  | "disk_quota"
  | "memory"
  | "memory_request"
  | "cores"
  | "network"
  | "cpu_shares"
  | "mintime"
  | "member_host";

export const upgrade_fields: upgrade_fields_type[] = [
  "member_host",
  "network",
  "mintime",
  "disk_quota",
  "memory",
  "memory_request",
  "cores",
  "cpu_shares"
];

export type Upgrades = { [field in upgrade_fields_type]: number };

export interface SiteLicense {
  id: string;
  title?: string;
  description?: string;
  info?: { [key: string]: any };
  expires?: Date;
  activates?: Date;
  created?: Date;
  last_used?: Date;
  managers?: string[];
  restricted?: boolean;
  upgrades?: Upgrades;
  run_limit?: number;
  apply_limit?: number;
}

export type license_field_type =
  | "string"
  | "paragraph"
  | "date"
  | "account_id[]"
  | "map"
  | "boolean"
  | "upgrades"
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
  | "restricted"
  | "upgrades"
  | "run_limit"
  | "apply_limit";

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
  run_limit: "number"
  //apply_limit: "number"
};

// export const source_fields = ["expires", "activates", "created", "last_used"];

export interface SiteLicensesState {
  view?: boolean; // if true, open for viewing/editing
  error?: string;
  loading?: boolean;
  creating?: boolean;
  site_licenses?: SiteLicense[];
  editing?: Set<string>; // id's of site licenses that are currently being edited.
  saving?: Set<string>; // id's of site licenses that are currently being saved to the backend.
  show_projects?: Map<string, Date | "now">; // id's where we should show the projects that are using the license and what cutoff date
  edits?: Map<string, TypedMap<SiteLicense>>;
  search?: string;
  matches_search?: Set<string> | undefined; // id's of licenses that match search
  usage_stats?: Map<string, number>; // {license_id:number of running projects using that license}
}
