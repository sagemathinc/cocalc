// the typing is very sloppy. parts of the UI use 0/1 for boolean, other parts
// a string like "1000" as a number 1000.
export interface QuotaParams {
  cores: number;
  cpu_shares: number;
  disk_quota: number;
  memory: number;
  memory_request: number;
  mintime: number;
  network: number;
  member_host: number;
  always_running?: number;
}
