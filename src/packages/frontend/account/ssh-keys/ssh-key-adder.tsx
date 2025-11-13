/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Input, Modal } from "antd";
import { useState } from "react";
import { useIntl } from "react-intl";
import { A, Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { compute_fingerprint } from "./fingerprint";
import ShowError from "@cocalc/frontend/components/error";

const ALLOWED_SSH_TYPES = [
  "ssh-rsa",
  "ssh-dss",
  "ssh-ed25519",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
] as const;

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
  type?: string;
  pubkey?: string;
  source?: string;
  comments?: string;
  error?: string;
  value: string;
}
const parse_key = function (value: string): ParsedKey {
  const parts: string[] = value.split(/\s+/);
  const type = parts[0];
  const pubkey = parts[1];
  const source = parts[2];
  const comments = parts.slice(3).join(" ");

  return { value, type, pubkey, source, comments };
};

const validate_key = function (value): ParsedKey {
  const key = parse_key(value);
  if (!ALLOWED_SSH_TYPES.includes(key.type as any)) {
    key.error = "Invalid key or type not supported";
  } else {
    delete key.error;
  }
  // TODO: Use some validation library?
  return key;
};

interface Props {
  add_ssh_key: Function;
  style?: React.CSSProperties;
  extra?: React.JSX.Element;
  size?;
}

export default function SSHKeyAdder({
  add_ssh_key,
  style,
  extra,
  size,
}: Props) {
  const [add, setAdd] = useState<boolean>(false);
  const intl = useIntl();
  const [keyTitle, setKeyTitle] = useState<string>("");
  const [keyValue, setKeyValue] = useState<string>("");
  const [error, setError] = useState<string>("");

  const button = (
    <Button size={size} onClick={() => setAdd(!add)}>
      <Icon name="plus-circle" /> Add SSH Key...
    </Button>
  );

  if (!add) {
    return button;
  }

  const addKey = intl.formatMessage({
    id: "account.ssh-key-adder.button",
    defaultMessage: "Add SSH Key",
  });

  function cancelAndClose() {
    setKeyTitle("");
    setKeyValue("");
    setError("");
    setAdd(false);
  }

  function submit_form(e?): void {
    let title;
    e?.preventDefault();
    try {
      const validated_key = validate_key(normalize_key(keyValue));
      if (validated_key.error != null) {
        setError(validated_key.error);
        return;
      } else {
        setError("");
      }

      if (keyTitle) {
        title = keyTitle;
      } else {
        title = validated_key.source;
      }

      const { value } = validated_key;

      add_ssh_key({
        title,
        value,
        fingerprint: compute_fingerprint(validated_key.pubkey),
      });

      cancelAndClose();
    } catch (err) {
      setError(`${err}`);
    }
  }

  return (
    <>
      {button}
      <Modal
        open
        onCancel={cancelAndClose}
        title={
          <>
            <Icon name="plus-circle" />{" "}
            {intl.formatMessage(
              {
                id: "account.ssh-key-adder.title",
                defaultMessage: "Add an <A>SSH key</A>",
              },
              {
                A: (c) => (
                  <A href="https://doc.cocalc.com/account/ssh.html">{c}</A>
                ),
              },
            )}
          </>
        }
        style={style}
        footer={[
          <Button onClick={() => cancelAndClose()} key="close">
            {intl.formatMessage(labels.cancel)}
          </Button>,
          <Button
            key="add"
            type="primary"
            onClick={submit_form}
            disabled={keyValue.length < 10}
          >
            {addKey}
          </Button>,
        ]}
      >
        {extra && extra}
        <div>
          Title
          <Input
            id="ssh-title"
            value={keyTitle}
            onChange={(e) => setKeyTitle(e.target.value)}
            placeholder={intl.formatMessage({
              id: "account.ssh-key-adder.placeholder",
              defaultMessage:
                "Choose a name for this ssh key to help you keep track of it...",
            })}
          />
          <div style={{ marginTop: "15px" }}>
            Key
            <Input.TextArea
              value={keyValue}
              rows={8}
              placeholder={`Begins with ${ALLOWED_SSH_TYPES_DESCRIPTION}`}
              onChange={(e) => setKeyValue((e.target as any).value)}
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

        <ShowError
          error={error}
          setError={setError}
          style={{ marginTop: "15px" }}
        />
      </Modal>
    </>
  );
}
