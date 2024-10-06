/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Input, Space } from "antd";
import { useState } from "react";
import { A, ErrorDisplay, Icon } from "@cocalc/frontend/components";

// Sibling Libraries
import { compute_fingerprint } from "./fingerprint";

const ALLOWED_SSH_TYPES = [
  "ssh-rsa",
  "ssh-dss",
  "ssh-ed25519",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
];

const ALLOWED_SSH_TYPES_DESCRIPTION =
  ALLOWED_SSH_TYPES.slice(0, -1).join(", ") +
  ", or " +
  ALLOWED_SSH_TYPES[ALLOWED_SSH_TYPES.length - 1];

// Removes all new lines and trims the output
// Newlines are simply illegal in SSH keys
const normalize_key = (value) =>
  value
    .trim()
    .split(/[\r\n]+/)
    .join("");

// Splits an SSH key into its parts. Doesn't allow options
// Assumes the key has valid formatting ie.
// <key-type>[space]<public-key>[space]<comment>
interface ParsedKey {
  type: string;
  pubkey: string;
  source: string;
  comments: string;
  error?: string;
  value: string;
}
const parse_key = function (value): ParsedKey {
  const parts = value.split(/\s+/);
  const type = parts[0];
  const pubkey = parts[1];
  const source = parts[2];
  const comments = parts.slice(3);

  return { value, type, pubkey, source, comments };
};

const validate_key = function (value): ParsedKey {
  const key = parse_key(value);
  if (!ALLOWED_SSH_TYPES.includes(key.type)) {
    key.error = "Invalid key or type not supported";
  } else {
    delete key.error;
  }
  // TODO: Use some validation library?
  return key;
};

interface Props {
  add_ssh_key: Function;
  toggleable?: boolean;
  style?: React.CSSProperties;
  extra?: JSX.Element;
}

export const SSHKeyAdder: React.FC<Props> = (props: Props) => {
  const { add_ssh_key, toggleable, style, extra } = props;
  const [key_title, set_key_title] = useState<string>("");
  const [key_value, set_key_value] = useState<string>("");
  const [show_panel, set_show_panel] = useState<boolean>(false);
  const [error, set_error] = useState<undefined | string>(undefined);

  function cancel_and_close() {
    set_key_title("");
    set_key_value("");
    set_show_panel(!toggleable);
    set_error(undefined);
  }

  function submit_form(e?): void {
    let title;
    e?.preventDefault();
    const validated_key = validate_key(normalize_key(key_value));
    if (validated_key.error != null) {
      set_error(validated_key.error);
      return;
    } else {
      set_error(undefined);
    }

    if (key_title) {
      title = key_title;
    } else {
      title = validated_key.source;
    }

    const { value } = validated_key;

    add_ssh_key({
      title,
      value,
      fingerprint: compute_fingerprint(validated_key.pubkey),
    });

    cancel_and_close();
  }

  function render_panel() {
    return (
      <Card
        title={
          <>
            <Icon name="plus-circle" /> Add an{" "}
            <A href="https://doc.cocalc.com/account/ssh.html">SSH key</A>
          </>
        }
        style={style}
      >
        {extra && extra}
        <div>
          Title
          <Input
            id="ssh-title"
            value={key_title}
            onChange={(e) => set_key_title(e.target.value)}
            placeholder={
              "Choose a name for this ssh key to help you keep track of it..."
            }
          />
          <div style={{ marginTop: "15px" }}>
            Key
            <Input.TextArea
              value={key_value}
              rows={8}
              placeholder={`Begins with ${ALLOWED_SSH_TYPES_DESCRIPTION}`}
              onChange={(e) => set_key_value((e.target as any).value)}
              onKeyDown={(e) => {
                if (e.keyCode == 13) {
                  e.preventDefault();
                  submit_form();
                }
              }}
              style={{ resize: "vertical" }}
            />
          </div>
        </div>
        <div style={{ marginTop: "15px" }}>
          <Space>
            {toggleable ? (
              <Button onClick={cancel_and_close}>Cancel</Button>
            ) : undefined}
            <Button
              type="primary"
              onClick={submit_form}
              disabled={key_value.length < 10}
            >
              Add SSH Key
            </Button>
          </Space>
          {error && (
            <ErrorDisplay
              error={error}
              onClose={() => set_error(undefined)}
              style={{ marginTop: "10px" }}
            />
          )}
        </div>
      </Card>
    );
  }

  function render_open_button() {
    return (
      <Button onClick={() => set_show_panel(true)} style={style}>
        <Icon name="terminal" /> Add SSH Key...
      </Button>
    );
  }

  if (!toggleable || show_panel) {
    return render_panel();
  } else {
    return render_open_button();
  }
};
