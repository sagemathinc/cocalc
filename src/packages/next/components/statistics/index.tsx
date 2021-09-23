import { Stats } from "@cocalc/util/db-schema/stats";
import OpenedFiles from "./opened-files";
import ActiveUsers from "./active-users";
import ActiveProjects from "./active-projects";

interface Props {
  stats: Stats;
}

export default function Statistics({ stats }: Props) {
  return (
    <div style={{ maxWidth: "100%", overflowX: "scroll" }}>
      Last Updated: {new Date(stats.time).toLocaleString()}
      <br />
      <br />
      <ActiveUsers
        created={stats.accounts_created}
        active={stats.accounts_active}
        hubServers={stats.hub_servers}
      />
      <br />
      <br />
      <ActiveProjects
        created={stats.projects_created}
        active={stats.projects_edited}
        running={stats.running_projects}
      />
      <br />
      <br />
      <OpenedFiles filesOpened={stats.files_opened} />
    </div>
  );
}
