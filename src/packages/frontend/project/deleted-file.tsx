/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect, useCallback, useState } from "react";
import { Modal } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { path_split } from "@cocalc/util/misc";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

interface Props {
  project_id: string;
  path: string;
  onOpen: Function;
}

export default function DeletedFile({ project_id, path, onOpen }: Props) {
  const [open, setOpen] = useState<boolean>(true);
  const isMountedRef = useIsMountedRef();
  const { tail: filename } = path_split(path);

  const openFile = useCallback(async () => {
    if (!isMountedRef.current) return;
    setOpen(false);
    const store = redux.getProjectStore(project_id);
    const listings = store.get_listings();
    await listings.undelete(path);
    onOpen();
  }, []);

  useEffect(() => {
    const store = redux.getProjectStore(project_id);
    const listings = store.get_listings();
    (async () => {
      if (await listings.exists(path)) {
        openFile();
      }
    })();
  }, []);

  return (
    <div className="smc-vfill" style={{ background: "#aaa" }}>
      <Modal
        visible={open}
        title={`Open previously deleted file "${filename}"?`}
        onOk={openFile}
        onCancel={() => {
          setOpen(false);
          redux.getProjectActions(project_id).close_tab(path);
        }}
      >
        After you open {path}, use TimeTravel to get past versions.
      </Modal>
    </div>
  );
}
