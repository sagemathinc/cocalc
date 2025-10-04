export interface MutagenSyncSession {
  identifier: string;
  version: number;
  creationTime: string; // ISO timestamp
  creatingVersion: string;
  alpha: MutagenEndpoint;
  beta: MutagenEndpoint;
  mode: string; // e.g. "two-way-resolved"
  ignore: Record<string, unknown>;
  symlink: Record<string, unknown>;
  watch: Record<string, unknown>;
  permissions: Record<string, unknown>;
  compression: Record<string, unknown>;
  name?: string;
  labels?: Record<string, string>;
  paused: boolean;
  status: string; // e.g. "watching", "staging", etc.
  successfulCycles?: number;
  lastError?: string;
  lastErrorTime?: string;
}

export interface MutagenEndpoint {
  protocol: string; // e.g. "local", "docker", "ssh"
  path: string;
  ignore: Record<string, unknown>;
  symlink: Record<string, unknown>;
  watch: Record<string, unknown>;
  permissions: Record<string, unknown>;
  compression: Record<string, unknown>;
  connected: boolean;
  scanned: boolean;
  directories: number;
  files: number;
  totalFileSize: number;
}
