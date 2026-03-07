/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
App preview panel for the .ai agent editor.

Displays the application that the agent creates in an iframe.
The app files live in a hidden directory derived from the .ai filename,
e.g.  foo.ai  →  .foo.ai.app/   which contains index.html, Python files, etc.
*/

import { Button, Empty, Spin } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { join } from "path";

import { useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { raw_url } from "@cocalc/frontend/frame-editors/frame-tree/util";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_split } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { EditorComponentProps } from "../frame-tree/types";

export function appDir(path: string): string {
  const { head, tail } = path_split(path);
  return join(head, `.${tail}.app`);
}

export default function AppPreview({ name }: EditorComponentProps) {
  const { project_id, path } = useFrameContext();
  const [exists, setExists] = useState<boolean | null>(null);
  const [localReload, setLocalReload] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dir = appDir(path);
  const indexPath = join(dir, "index.html");

  // Watch the resize counter from the store (incremented by actions.reloadAppPreview())
  const storeReload: number = useRedux(name, "resize") ?? 0;

  const checkExists = useCallback(async () => {
    try {
      await webapp_client.project_client.readFile({
        project_id,
        path: indexPath,
      });
      setExists(true);
    } catch {
      setExists(false);
    }
  }, [project_id, indexPath]);

  const reload = localReload + storeReload;

  useEffect(() => {
    checkExists();
  }, [checkExists, reload]);

  if (exists === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Spin />
      </div>
    );
  }

  if (!exists) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 20,
        }}
      >
        <Empty
          description={
            <span style={{ color: COLORS.GRAY_M }}>
              No app yet. Ask the agent to create an application and it will
              appear here.
            </span>
          }
        />
      </div>
    );
  }

  const src = `${raw_url(project_id, indexPath)}?v=${reload}`;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "4px 8px",
          borderBottom: `1px solid ${COLORS.GRAY_L}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: COLORS.GRAY_LLL,
        }}
      >
        <Button
          size="small"
          onClick={() => setLocalReload((n) => n + 1)}
          icon={<Icon name="refresh" />}
        >
          Reload
        </Button>
      </div>
      <iframe
        ref={iframeRef}
        src={src}
        style={{
          flex: 1,
          width: "100%",
          border: 0,
        }}
        sandbox="allow-forms allow-scripts allow-presentation allow-same-origin"
      />
    </div>
  );
}
