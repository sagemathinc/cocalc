/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Help popover for the file explorer, rendered in the pagination footer.
 * Provides a quick reference for all explorer features and a "Start Tour"
 * button that triggers the interactive explorer tour.
 */

import { Button, Divider, Popover, Typography } from "antd";
import { useState } from "react";

import { redux } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import { Icon, type IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";

const { Text } = Typography;

interface Props {
  project_id: string;
}

function HelpContent({
  project_id,
  onClose,
}: {
  project_id: string;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        maxWidth: 420,
        maxHeight: "50vh",
        overflowY: "auto",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <Section title="Selecting Files" icon="check-square-o">
        Click a file to open it. Use the checkbox to select files for bulk
        actions. <Text strong>Shift+click</Text> a checkbox to select a range.
      </Section>

      <Section title="Right-Click Menu" icon="bars">
        Right-click any file for a context menu with rename, copy, move, delete,
        share, download, compress, and copy filename/path.
      </Section>

      <Section title="Copy vs Duplicate" icon="copy">
        <Text strong>Copy</Text> moves files to a different folder or project.{" "}
        <Text strong>Duplicate</Text> creates a copy in the same folder with a
        &ldquo;-copy&rdquo; suffix.
      </Section>

      <Section title="Rename vs Move" icon="pencil">
        <Text strong>Rename</Text> changes the name in the same folder.{" "}
        <Text strong>Move</Text> relocates to a different folder (or use
        drag-and-drop).
      </Section>

      <Section title="Drag & Drop" icon="arrows">
        <Text strong>Long-press</Text> (~300ms) a file to start dragging. Drop
        onto folders or breadcrumbs to move. Hold <Text strong>Shift</Text>{" "}
        while dropping to copy instead. Valid drop targets light up green during
        drag.
      </Section>

      <Section title="Type Filter" icon="sliders">
        Click the filter icon in the type column header to show only files of a
        specific type (e.g., .py, .ipynb, folders).
      </Section>

      <Section title="Flyout Panel" icon="files">
        Open the compact file browser in the side panel via the files icon in
        the activity bar. It shares the same type filter and supports
        drag-and-drop.
      </Section>

      <Section title="Keyboard Navigation" icon="keyboard">
        Type in the search bar to filter files. Use arrow keys to navigate the
        filtered list, Enter to open.
      </Section>

      <Divider style={{ margin: "8px 0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button
          size="small"
          onClick={() => {
            onClose();
            redux
              .getProjectActions(project_id)
              .setState({ explorerTour: true });
          }}
        >
          <Icon name="map" /> Start Tour
        </Button>
        <span style={{ color: COLORS.GRAY, fontSize: 12 }}>
          Step-by-step walkthrough of the explorer
        </span>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: COLORS.GRAY }}>
        <A href="https://doc.cocalc.com/explorer.html">Full documentation</A>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <Text strong>
        <Icon name={icon} style={{ marginRight: 4, width: 16 }} />
        {title}
      </Text>
      <br />
      <span style={{ color: COLORS.GRAY_D }}>{children}</span>
    </div>
  );
}

export default function ExplorerHelp({ project_id }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      placement="topRight"
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      title={
        <div>
          File Explorer Help
          <Button
            type="text"
            size="small"
            style={{ float: "right" }}
            onClick={() => setOpen(false)}
          >
            <Icon name="times" />
          </Button>
        </div>
      }
      content={
        <HelpContent project_id={project_id} onClose={() => setOpen(false)} />
      }
    >
      <Button
        type="text"
        size="small"
        style={{ color: COLORS.BS_BLUE_TEXT, fontSize: 12 }}
      >
        <Icon name="question-circle" /> Help
      </Button>
    </Popover>
  );
}
