import { hubApi } from "@cocalc/lite/hub/api";
import { account_id } from "@cocalc/backend/data";
import { uuid, isValidUUID } from "@cocalc/util/misc";
import { upsertProject } from "../sqlite/projects";
import { type CreateProjectOptions } from "@cocalc/util/db-schema/projects";
import type { client as projectRunnerClient } from "@cocalc/conat/project/runner/run";
import {
  DEFAULT_PROJECT_IMAGE,
  DEFAULT_COMPUTE_IMAGE,
} from "@cocalc/util/db-schema/defaults";
import getLogger from "@cocalc/backend/logger";
import { reportProjectStateToMaster } from "../master-status";

const logger = getLogger("project-host:hub:projects");

type RunnerApi = ReturnType<typeof projectRunnerClient>;

// **TODO: This normalizeImage is VERY VERY TEMPORARY!!!**
// The only reason for this is the frontend by default uses the massive cocalc rootfs's
// by default, which of course aren't the name of Docker images. For now, we just
// revert them back to the the default docker image.
// We will definitely change this for the actual release.
function normalizeImage(image?: string): string {
  const trimmed = image?.trim();
  if (!trimmed) return DEFAULT_PROJECT_IMAGE;
  if (trimmed.includes(":") || trimmed.includes("/")) {
    return trimmed;
  }
  if (trimmed === DEFAULT_COMPUTE_IMAGE) {
    return DEFAULT_PROJECT_IMAGE;
  }
  // Otherwise assume it's a label meant for the old compute image list; fall back for now.
  return DEFAULT_PROJECT_IMAGE;
}

function ensureProjectRow({
  project_id,
  opts,
  state = "stopped",
  http_port,
  ssh_port,
  authorized_keys,
}: {
  project_id: string;
  opts?: CreateProjectOptions;
  state?: string;
  http_port?: number;
  ssh_port?: number;
  authorized_keys?: string;
}) {
  logger.debug("ensureProjectRow", { project_id, opts, state });
  const now = Date.now();
  const row: any = {
    project_id,
    state,
    updated_at: now,
    last_seen: now,
  };
  if (http_port !== undefined) {
    row.http_port = http_port;
  }
  if (ssh_port !== undefined) {
    row.ssh_port = ssh_port;
  }
  if (authorized_keys !== undefined) {
    row.authorized_keys = authorized_keys;
  }
    if (opts) {
      const title = opts.title?.trim();
      if (title) {
        row.title = title;
      }
      if (opts.image !== undefined) {
      row.image = normalizeImage(opts.image);
    }
    if ((opts as any)?.users !== undefined) {
      row.users = (opts as any).users;
      // [ ] TODO -- for now we always included the default user;
      // this is obviously temporary
      row.users[account_id] = { group: "owner" };
    }
  }
  upsertProject(row);
  if (state) {
    reportProjectStateToMaster(project_id, state);
  }
}

export function wireProjectsApi(runnerApi: RunnerApi) {
  if (!hubApi.projects) {
    (hubApi as any).projects = {};
  }
  // Create a project locally and optionally start it.
  hubApi.projects.createProject = async (
    opts: CreateProjectOptions = {},
  ): Promise<string> => {
    const project_id =
      opts.project_id && isValidUUID(opts.project_id)
        ? opts.project_id
        : uuid();

    ensureProjectRow({
      project_id,
      opts,
      state: "stopped",
      authorized_keys: (opts as any).authorized_keys,
    });

    if (opts.start) {
      const status = await runnerApi.start({
        project_id,
        config: { image: normalizeImage(opts.image) },
      });
      ensureProjectRow({
        project_id,
        opts,
        state: status?.state ?? "running",
        http_port: (status as any)?.http_port,
        ssh_port: (status as any)?.ssh_port,
      });
    }

    return project_id;
  };

  hubApi.projects.start = async ({
    project_id,
  }: {
    project_id: string;
  }): Promise<void> => {
    const status = await runnerApi.start({
      project_id,
      config: { image: normalizeImage() },
    });
    ensureProjectRow({
      project_id,
      state: status?.state ?? "running",
      http_port: (status as any)?.http_port,
      ssh_port: (status as any)?.ssh_port,
    });
  };

  hubApi.projects.stop = async ({
    project_id,
    force,
  }: {
    project_id: string;
    force?: boolean;
  }): Promise<void> => {
    const status = await runnerApi.stop({ project_id, force });
    ensureProjectRow({
      project_id,
      state: status?.state ?? "stopped",
      http_port: undefined,
      ssh_port: undefined,
    });
  };
}
