import {
  React,
  useTypedRedux,
  useActions,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { SiteName } from "@cocalc/frontend/customize";
import { useMemo } from "react";

interface Props {
  project_id: string;
  is_active?: boolean;
}

export const ProjectIframePage: React.FC<Props> = ({
  project_id,
  is_active = true,
}) => {
  const project_map = useTypedRedux("projects", "project_map");
  const page_actions = useActions("page");

  const host: any = project_map?.getIn([project_id, "host"]) ?? undefined;
  const title = String(
    project_map?.getIn([project_id, "title"]) ??
      project_map?.getIn([project_id, "name"]) ??
      project_id,
  );

  const src = useMemo(() => {
    if (!host) return undefined;
    const url =
      typeof host.get === "function" ? host.get("public_url") : host?.public_url;
    if (!url) return undefined;
    const target = encodeURIComponent(`/projects/${project_id}`);
    return `${url.replace(/\/$/, "")}/static/app.html?target=${target}`;
  }, [host, project_id]);

  if (!host || !src) {
    return (
      <div style={{ padding: "20px" }}>
        <Loading />
        <div style={{ marginTop: "10px" }}>
          Waiting for host assignment for project <b>{title}</b>. This may take a
          few seconds.
          <br />
          If it does not resolve, try reloading or visit the{" "}
          <a
            href="#projects"
            onClick={(e) => {
              e.preventDefault();
              page_actions.set_active_tab("projects");
            }}
          >
            Projects list
          </a>
          .
        </div>
      </div>
    );
  }

  return (
    <iframe
      title={`Project ${title}`}
      src={src}
      style={{
        border: "none",
        width: "100%",
        height: "100%",
        display: is_active ? "block" : "none",
      }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads allow-modals"
      allow="clipboard-read; clipboard-write; fullscreen; geolocation"
    >
      <div style={{ padding: "20px" }}>
        <Icon name="exclamation-triangle" /> Unable to load project from host.
        Please try again.
        <div style={{ marginTop: "10px" }}>
          You may need to allow framing for <SiteName /> in your browser settings.
        </div>
      </div>
    </iframe>
  );
};
