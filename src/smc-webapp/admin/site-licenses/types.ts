import { Set } from "immutable";

export interface SiteLicense {
  id: string;
  name?: string;
  expires?: Date;
  activates?: Date;
  created?: Date;
  last_active?: Date;
  admins?: string[];
  restricted?: boolean;
  upgrades?: any; // todo -- there is a type for this
  run_limit?: number;
  apply_limit?: number;
}

export interface SiteLicensesState {
  view?: boolean; // if true, open for viewing/editing
  error?: string;
  loading?: boolean;
  creating?: boolean;
  site_licenses?: SiteLicense[];
  editing?: Set<string>; // id's of site licenses that are currently being edited.
}
