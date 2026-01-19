import { Drawer, Space } from "antd";
import { useIntl } from "react-intl";
import { useActions, useState, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { ProjectRowExpandedContent } from "./project-row-expanded-content";

const DRAWER_SIZE_STORAGE_KEY = "cocalc:projects:drawerWidth";
const MIN_DRAWER_WIDTH = 360;
const MAX_DRAWER_WIDTH = 960;

function clampDrawerWidth(width: number): number {
  return Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, width));
}

function readDrawerWidth(): number | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const raw = window.localStorage.getItem(DRAWER_SIZE_STORAGE_KEY);
  if (raw == null) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return clampDrawerWidth(parsed);
}

function persistDrawerWidth(width: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    DRAWER_SIZE_STORAGE_KEY,
    String(clampDrawerWidth(width)),
  );
}

export function ProjectDrawer() {
  const intl = useIntl();
  const actions = useActions("projects");
  const expanded_project_id = useTypedRedux("projects", "expanded_project_id");
  const project_map = useTypedRedux("projects", "project_map");
  const project = expanded_project_id
    ? project_map?.get(expanded_project_id)
    : undefined;
  const title = project?.get("title") ?? intl.formatMessage(labels.project);
  const [drawerWidth, setDrawerWidth] = useState<number | undefined>(
    readDrawerWidth,
  );

  const handleResize = (next: number) => {
    const clamped = clampDrawerWidth(next);
    setDrawerWidth(clamped);
    try {
      persistDrawerWidth(clamped);
    } catch {}
  };

  return (
    <Drawer
      size={drawerWidth}
      placement="right"
      title={
        <Space>
          <Icon name="edit" /> {title}
        </Space>
      }
      onClose={() => actions.set_expanded_project(undefined)}
      resizable={{ onResize: handleResize }}
      open={!!expanded_project_id}
    >
      {expanded_project_id && (
        <ProjectRowExpandedContent project_id={expanded_project_id} />
      )}
    </Drawer>
  );
}
