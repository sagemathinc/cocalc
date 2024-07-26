/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Stats } from "@cocalc/util/db-schema/stats";
import OpenedFiles from "./opened-files";
import ActiveUsers from "./active-users";
import ActiveProjects from "./active-projects";
import A from "components/misc/A";
import { CSS, Paragraph } from "components/misc";

const STYLE: CSS = {
  marginBottom: "40px",
} as const;

interface Props {
  stats: Stats;
}

export default function Statistics({ stats }: Props) {
  return (
    <div style={{ maxWidth: "100%", overflowX: "auto" }}>
      <Paragraph style={STYLE}>
        Last Updated: {new Date(stats.time).toLocaleString()}{" "}
        <A href="/info/status">(update)</A>
      </Paragraph>
      <ActiveUsers
        created={stats.accounts_created}
        active={stats.accounts_active}
        hubServers={stats.hub_servers}
        style={STYLE}
      />
      <ActiveProjects
        style={STYLE}
        created={stats.projects_created}
        active={stats.projects_edited}
        running={stats.running_projects}
      />
      <OpenedFiles style={STYLE} filesOpened={stats.files_opened} />
    </div>
  );
}
