/*
React hook that gives realtime information about a project.

*/

import { useInterval } from "react-interval-hook";
import { get, type ProjectInfo } from "@cocalc/conat/project/project-info";
import { useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { labels } from "@cocalc/frontend/i18n";

export default function useProjectInfo({
  project_id,
  compute_server_id = 0,
  interval = 4000,
}: {
  project_id: string;
  compute_server_id?: number;
  interval?: number;
}): {
  info: ProjectInfo | null;
  error: string;
  setError: (string) => void;
  disconnected: boolean;
} {
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
  const projectLabelLower = projectLabel.toLowerCase();
  const start = useMemo(() => Date.now(), []);
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [disconnected, setDisconnected] = useState<boolean>(true);
  const update = async () => {
    // console.log("update", { project_id });
    try {
      const info = await get({ project_id, compute_server_id });
      setInfo(info);
      setDisconnected(false);
      setError("");
    } catch (err) {
      if (Date.now() - start >= interval * 2.1) {
        console.log(`WARNING: project info -- ${err}`);
        setError(
          `${projectLabel} info not available -- start the ${projectLabelLower}`,
        );
      }
      setDisconnected(true);
    }
  };

  useInterval(update, interval);

  useEffect(() => {
    update();
  }, [project_id, compute_server_id]);

  return { info, error, setError, disconnected };
}
