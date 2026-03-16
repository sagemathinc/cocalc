/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Space } from "antd";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { Icon, Tip } from "@cocalc/frontend/components";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

interface PrivateNotesProps {
  title: string;
  tip: string;
  value: string;
  onSave: (value: string) => void;
  placeholder: string;
  persistId: string;
}

interface PersistedNoteState {
  editing: boolean;
  value: string;
}

const persistedNotes = new Map<string, PersistedNoteState>();

export function PrivateNotes({
  title,
  tip,
  value,
  onSave,
  placeholder,
  persistId,
}: PrivateNotesProps) {
  const intl = useIntl();
  const [noteValue, setNoteValue] = useState<string>(value);
  const [editing, setEditing] = useState<boolean>(false);
  const editLabel = intl.formatMessage({
    id: "course.notes.edit_label",
    defaultMessage: "Notes:",
  });
  const doneLabel = intl.formatMessage({
    id: "course.notes.done_label",
    defaultMessage: "Done",
  });

  useEffect(() => {
    const persisted = persistedNotes.get(persistId);
    if (persisted != null) {
      setNoteValue(persisted.value);
      setEditing(persisted.editing);
    } else {
      setNoteValue(value);
      setEditing(false);
    }
  }, [persistId]);

  useEffect(() => {
    if (editing) return;
    const persisted = persistedNotes.get(persistId);
    if (persisted?.editing) return;
    setNoteValue(value);
  }, [editing, persistId, value]);

  useEffect(() => {
    if (editing || noteValue !== value) {
      persistedNotes.set(persistId, { editing, value: noteValue });
    } else {
      persistedNotes.delete(persistId);
    }
  }, [editing, noteValue, persistId, value]);

  function toggle() {
    if (editing) {
      onSave(noteValue);
    }
    setEditing(!editing);
  }

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
          onClick={toggle}
        >
          {editing ? doneLabel : editLabel}
        </Button>
      </Tip>
      <div style={{ minWidth: 0, width: "100%" }}>
        {editing ? (
          <MultiMarkdownInput
            value={noteValue}
            onChange={setNoteValue}
            placeholder={placeholder}
            height="200px"
            minimal
            enableUpload={false}
          />
        ) : (
          <StaticMarkdown value={noteValue ?? ""} />
        )}
      </div>
    </Space>
  );
}
