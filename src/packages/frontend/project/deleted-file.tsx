/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Modal } from "antd";
import { useCallback, useState } from "react";
import { useIntl } from "react-intl";
import { redux } from "@cocalc/frontend/app-framework";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { path_split } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components";
import { log_file_open } from "@cocalc/frontend/project/open-file";
import { labels } from "@cocalc/frontend/i18n";

interface Props {
  project_id: string;
  path: string;
  time: number;
}

export default function DeletedFile({ project_id, path, time }: Props) {
  const intl = useIntl();
  const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();
  const [open, setOpen] = useState<boolean>(true);
  const isMountedRef = useIsMountedRef();
  const { tail: filename } = path_split(path);

  const openFile = useCallback(async () => {
    if (!isMountedRef.current) return;
    setOpen(false);
    const actions = redux.getProjectActions(project_id);
    actions.setNotDeleted(path);
    log_file_open(project_id, path, time);
  }, []);

  return (
    <div className="smc-vfill" style={{ background: "#aaa" }}>
      <Modal
        open={open}
        title={
          <div style={{ paddingRight: "15px" }}>
            The file "{filename}" was deleted or moved{" "}
            <TimeAgo date={new Date(time)} />. Restore this file?
          </div>
        }
        onOk={openFile}
        okText={"Restore File"}
        cancelText={"Leave File Closed"}
        onCancel={() => {
          setOpen(false);
          redux.getProjectActions(project_id).close_tab(path);
        }}
      >
        {!path?.endsWith(".term") && (
          <>
            {" "}
            You can always restore later using the {projectLabelLower} log. If
            you restore {path}, use TimeTravel to get past versions.
          </>
        )}
      </Modal>
    </div>
  );
}
