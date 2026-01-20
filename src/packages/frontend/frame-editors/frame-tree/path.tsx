/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { message } from "antd";
import { CSS, React, redux } from "../../app-framework";
import { set_buffer } from "@cocalc/frontend/copy-paste-buffer";
import { filename_extension } from "@cocalc/util/misc";
import { file_associations } from "../../file-associations";
import { Icon } from "../../components";

interface Props {
  is_current?: boolean;
  project_id: string;
  path: string;
}

const STYLE = {
  borderBottom: "1px solid lightgrey",
  borderRight: "1px solid lightgrey",
  padding: "0 5px",
  borderTopLeftRadius: "5px",
  borderTopRightRadius: "5px",
  color: "#337ab7",
  cursor: "pointer",
  width: "100%",
  fontSize: "10pt",
  position: "relative",
} as CSS;

const CURRENT_STYLE = {
  ...STYLE,
  ...{ background: "#337ab7", color: "white" },
} as CSS;

export const Path: React.FC<Props> = React.memo(
  ({ is_current, path, project_id }) => {
    const ext = filename_extension(path);
    const x = file_associations[ext];
    const [copied, setCopied] = React.useState(false);
    const copyTimeoutRef = React.useRef<number | null>(null);

    React.useEffect(() => {
      return () => {
        if (copyTimeoutRef.current != null) {
          window.clearTimeout(copyTimeoutRef.current);
        }
      };
    }, []);

    return (
      <div
        style={{
          ...(is_current ? CURRENT_STYLE : STYLE),
          ...(copied ? { paddingRight: "60px" } : undefined),
        }}
        onClick={(evt) => {
          // shift+clicking opens the given path as its own tab...
          if (evt.shiftKey) {
            const project_actions = redux.getProjectActions(project_id);
            project_actions.open_file({ path, foreground: true });
            return;
          }
          set_buffer(path);
          setCopied(true);
          if (copyTimeoutRef.current != null) {
            window.clearTimeout(copyTimeoutRef.current);
          }
          copyTimeoutRef.current = window.setTimeout(() => {
            setCopied(false);
          }, 1200);
          message.success({ content: "Copied path", key: "copy-path", duration: 1.2 });
        }}
      >
        {x?.icon && <Icon name={x.icon} />} {path}
        {copied && (
          <span
            style={{
              position: "absolute",
              right: "6px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.9)",
              color: "#333",
              borderRadius: "4px",
              padding: "1px 6px",
              fontSize: "9pt",
              fontWeight: 600,
              pointerEvents: "none",
            }}
          >
            Copied
          </span>
        )}
      </div>
    );
  }
);
