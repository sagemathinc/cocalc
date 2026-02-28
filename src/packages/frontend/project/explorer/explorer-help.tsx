/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Help popover for the file explorer, rendered in the pagination footer.
 * Provides a quick reference for all explorer features and a "Start Tour"
 * button that triggers the interactive explorer tour.
 */

import { Button, Divider, Popover, Tag, Typography } from "antd";
import React, { useState } from "react";
import { defineMessages, useIntl } from "react-intl";

import { redux } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import { Icon, type IconName } from "@cocalc/frontend/components/icon";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";

const { Text } = Typography;

const messages = defineMessages({
  title: {
    id: "project.explorer.help.title",
    defaultMessage: "File Explorer Help",
    description: "Title of the file explorer help popover",
  },
  start_tour: {
    id: "project.explorer.help.start_tour",
    defaultMessage: "Start Tour",
    description: "Button that starts the interactive file explorer tour",
  },
  full_docs: {
    id: "project.explorer.help.full_docs",
    defaultMessage: "Full docs",
  },
  section_open_select_title: {
    id: "project.explorer.help.section.open_select.title",
    defaultMessage: "Open & Select",
  },
  section_open_select_body: {
    id: "project.explorer.help.section.open_select.body",
    defaultMessage:
      "Click to open. Check the box to select for bulk actions. Shift+click selects a range.",
  },
  section_context_menu_title: {
    id: "project.explorer.help.section.context_menu.title",
    defaultMessage: "Right-Click Menu",
  },
  section_context_menu_body: {
    id: "project.explorer.help.section.context_menu.body",
    defaultMessage:
      "Rename, copy, move, delete, share, download, compress, copy path.",
  },
  section_dnd_title: {
    id: "project.explorer.help.section.dnd.title",
    defaultMessage: "Drag & Drop",
  },
  section_dnd_body: {
    id: "project.explorer.help.section.dnd.body",
    defaultMessage:
      "Long-press (~300ms) to drag. Drop onto folders or breadcrumbs to move. Hold Shift to copy instead.",
  },
  section_preview_title: {
    id: "project.explorer.help.section.preview.title",
    defaultMessage: "Directory Preview",
  },
  section_preview_body: {
    id: "project.explorer.help.section.preview.body",
    defaultMessage:
      "Click the expand arrow on any folder to peek at its contents inline.",
  },
  section_type_filter_title: {
    id: "project.explorer.help.section.type_filter.title",
    defaultMessage: "Type Filter",
  },
  section_type_filter_body: {
    id: "project.explorer.help.section.type_filter.body",
    defaultMessage:
      "Click the column filter icon to show only files of a specific type.",
  },
  section_flyout_title: {
    id: "project.explorer.help.section.flyout.title",
    defaultMessage: "Flyout Panel",
  },
  section_flyout_body: {
    id: "project.explorer.help.section.flyout.body",
    defaultMessage:
      "The side-panel file browser shares the type filter and supports drag-and-drop.",
  },
  section_search_title: {
    id: "project.explorer.help.section.search.title",
    defaultMessage: "Search & Terminal",
  },
  section_search_body: {
    id: "project.explorer.help.section.search.body",
    defaultMessage:
      "Filter by name in the search bar; arrow keys + Enter to open. Switch to the mini terminal for shell commands.",
  },
  new_tag: {
    id: "project.explorer.help.new_tag",
    defaultMessage: "New",
    description: "Short tag label indicating a new feature",
  },
});

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
  const intl = useIntl();
  const newTag = intl.formatMessage(messages.new_tag);

  return (
    <div
      style={{
        maxWidth: 400,
        maxHeight: "50vh",
        overflowY: "auto",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Button
          size="small"
          type="primary"
          onClick={() => {
            onClose();
            redux
              .getProjectActions(project_id)
              .setState({ explorerTour: true });
          }}
        >
          <Icon name="map" /> {intl.formatMessage(messages.start_tour)}
        </Button>
        <A href="https://doc.cocalc.com/explorer.html" style={{ fontSize: 12 }}>
          {intl.formatMessage(messages.full_docs)}
        </A>
      </div>

      <Divider style={{ margin: "6px 0" }} />

      <Section
        title={intl.formatMessage(messages.section_open_select_title)}
        icon="check-square-o"
      >
        {intl.formatMessage(messages.section_open_select_body)}
      </Section>

      <Section
        title={intl.formatMessage(messages.section_context_menu_title)}
        icon="bars"
      >
        {intl.formatMessage(messages.section_context_menu_body)}
      </Section>

      <Section
        title={intl.formatMessage(messages.section_dnd_title)}
        icon="arrows"
        tag={newTag}
      >
        {intl.formatMessage(messages.section_dnd_body)}
      </Section>

      <Section
        title={intl.formatMessage(messages.section_preview_title)}
        icon="folder-open"
        tag={newTag}
      >
        {intl.formatMessage(messages.section_preview_body)}
      </Section>

      <Section
        title={intl.formatMessage(messages.section_type_filter_title)}
        icon="sliders"
      >
        {intl.formatMessage(messages.section_type_filter_body)}
      </Section>

      <Section
        title={intl.formatMessage(messages.section_flyout_title)}
        icon="files"
        tag={newTag}
      >
        {intl.formatMessage(messages.section_flyout_body)}
      </Section>

      <Section
        title={intl.formatMessage(messages.section_search_title)}
        icon="keyboard"
      >
        {intl.formatMessage(messages.section_search_body)}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  tag,
  children,
}: {
  title: string;
  icon: IconName;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <Text strong>
        <Icon name={icon} style={{ marginRight: 4, width: 16 }} />
        {title}
        {tag && (
          <Tag
            color="blue"
            style={{ marginLeft: 4, fontSize: 10, padding: "0 4px" }}
          >
            {tag}
          </Tag>
        )}
      </Text>
      <br />
      <span style={{ color: COLORS.GRAY_D }}>{children}</span>
    </div>
  );
}

export default function ExplorerHelp({ project_id }: Props) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);

  return (
    <Popover
      placement="topRight"
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      title={
        <div>
          {intl.formatMessage(messages.title)}
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
        <Icon name="question-circle" /> {intl.formatMessage(labels.help)}
      </Button>
    </Popover>
  );
}
