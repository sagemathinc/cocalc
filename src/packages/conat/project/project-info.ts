/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ProjectInfo } from "@cocalc/util/types/project-info/types";
export type { ProjectInfo };
import { getLogger } from "@cocalc/conat/client";
import { projectSubject } from "@cocalc/conat/names";
import { conat } from "@cocalc/conat/client";

const SERVICE_NAME = "project-info";
const logger = getLogger("project:project-info");

interface Api {
  get: () => Promise<ProjectInfo | null>;
}

export async function get({
  project_id,
  compute_server_id = 0,
}: {
  project_id: string;
  compute_server_id?: number;
}) {
  const c = await conat();
  const subject = getSubject({ project_id, compute_server_id });
  return await c.call(subject).get();
}

function getSubject({ project_id, compute_server_id }) {
  return projectSubject({
    project_id,
    compute_server_id,
    service: SERVICE_NAME,
  });
}

export function createService(opts: {
  infoServer;
  project_id: string;
  compute_server_id: number;
}) {
  return new ProjectInfoService(opts);
}

class ProjectInfoService {
  private infoServer?;
  private service?;
  private readonly subject: string;
  info?: ProjectInfo | null = null;

  constructor({ infoServer, project_id, compute_server_id }) {
    logger.debug("register");
    this.subject = getSubject({ project_id, compute_server_id });
    // initializing project info server + reacting when it has something to say
    this.infoServer = infoServer;
    this.infoServer.start();
    this.infoServer.on("info", this.saveInfo);
    this.createService();
  }

  private saveInfo = (info) => {
    this.info = info;
  };

  private createService = async () => {
    logger.debug("started project info service ", { subject: this.subject });
    const client = await conat();
    this.service = await client.service<Api>(this.subject, {
      get: async () => this.info ?? null,
    });
  };

   close = (): void => {
    if (this.infoServer == null) {
      return;
    }
    logger.debug("close");
    this.infoServer?.removeListener("info", this.saveInfo);
    delete this.infoServer;
    this.service?.close();
    delete this.service;
  }
}
