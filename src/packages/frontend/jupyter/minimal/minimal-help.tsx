/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Help popover for the minimal Jupyter notebook layout.
 * Quick reference for features specific to the minimal view.
 */

import { Button, Divider, Popover, Tag, Typography } from "antd";
import React, { useState } from "react";

import { Icon, type IconName } from "@cocalc/frontend/components/icon";

const { Text } = Typography;

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
      <span style={{ color: "var(--cocalc-text-primary-strong, #555)" }}>
        {children}
      </span>
    </div>
  );
}

function HelpContent() {
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
      <Section title="Side-by-Side Layout" icon="pic-centered">
        Output is on the left, code on the right. This keeps the focus on your
        results while code stays accessible. Hover over the code column to see
        run and action buttons.
      </Section>

      <Section title="Zen Mode" icon="eye-slash">
        Toggle Zen mode to hide all code cells and show only outputs and
        markdown. Great for presentations or reading through results.
      </Section>

      <Section title="AI Assistant" icon="robot">
        The side-chat AI assistant works with this notebook. Use it to ask
        questions about your code, generate cells, or debug errors. Deeper
        integration is coming soon.
      </Section>

      <Section title="Mini Table of Contents" icon="list-ul" tag="New">
        In comfortable and narrow widths, a floating TOC appears in the left
        margin. Click an entry to jump to that section. Double-click to run all
        code cells in that section.
      </Section>

      <Section title="Layout Widths" icon="column-width">
        Use the width controls in the status bar to switch between{" "}
        <strong>Wide</strong> (full width), <strong>Comfortable</strong>{" "}
        (centered with TOC), and <strong>Narrow</strong> (compact centered).
      </Section>

      <Section title="Run Controls" icon="play">
        The run button on each cell has a dropdown with options to run cells
        above or below, both for the entire notebook and scoped to the current
        section.
      </Section>

      <Section title="Keyboard Shortcuts" icon="keyboard">
        All standard Jupyter keyboard shortcuts work as usual: Shift+Enter to
        run, Esc/Enter for command/edit mode, arrow keys to navigate, etc.
      </Section>

      <Divider style={{ margin: "6px 0" }} />

      <Section title="Frame Editor Integration" icon="frame">
        This is a frame in the frame editor. You can split the view, open
        multiple frames for the same notebook, switch any frame to the classic
        notebook view, a terminal, or other editors.
      </Section>
    </div>
  );
}

export default function MinimalNotebookHelp() {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      placement="bottomRight"
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      title={
        <div>
          Minimal Notebook Help
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
      content={<HelpContent />}
    >
      <Button
        type="text"
        size="small"
        style={{ color: "var(--cocalc-link, #1677ff)" }}
      >
        <Icon name="question-circle" /> Help
      </Button>
    </Popover>
  );
}
