export interface SiteLicensePublicInfo {
  id: string;
  title: string;
  activates?: Date;
  expires?: Date;
  run_limit?: number;
  upgrades?: { [field: string]: number };
  running: number;
  is_manager: boolean;
}
