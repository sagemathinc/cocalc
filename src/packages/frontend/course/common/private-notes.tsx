/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Space } from "antd";
import { useIntl } from "react-intl";

import { Icon, Tip } from "@cocalc/frontend/components";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

interface PrivateNotesProps {
  title: string;
  tip: string;
  value: string;
  editing: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  placeholder: string;
}

export function PrivateNotes({
  title,
  tip,
  value,
  editing,
  onToggle,
  onChange,
  placeholder,
}: PrivateNotesProps) {
  const intl = useIntl();
  const editLabel = intl.formatMessage({
    id: "course.notes.edit_label",
    defaultMessage: "Notes:",
  });
  const doneLabel = intl.formatMessage({
    id: "course.notes.done_label",
    defaultMessage: "Done",
  });

  return (
    <Space
      key="note"
      align="start"
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
      }}
    >
      <Tip title={title} tip={tip}>
        <Button
          icon={<Icon name="pencil" />}
          type={editing ? "primary" : "default"}
          onClick={onToggle}
        >
          {editing ? doneLabel : editLabel}
        </Button>
      </Tip>
      <div style={{ minWidth: 0, width: "100%" }}>
        {editing ? (
          <MultiMarkdownInput
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            height="200px"
            minimal
            enableUpload={false}
          />
        ) : (
          <StaticMarkdown value={value ?? ""} />
        )}
      </div>
    </Space>
  );
}
