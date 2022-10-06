/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Card, Button } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { Space } from "@cocalc/frontend/components";
import { path_split } from "@cocalc/util/misc";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

interface Props {
  project_id: string;
  path: string;
  onOpen: Function;
}

export default function DeletedFile({ project_id, path, onOpen }: Props) {
  const isMountedRef = useIsMountedRef();
  const filename = path_split(path).tail;
  return (
    <div className="smc-vfill" style={{ background: "#aaa" }}>
      <Card
        title={`Open previously deleted file "${filename}"?`}
        style={{ margin: "auto" }}
      >
        After you open {path}, use TimeTravel to get past versions.
        <br />
        <br />
        <div style={{ float: "right" }}>
          <Button
            onClick={() => redux.getProjectActions(project_id).close_tab(path)}
          >
            Cancel
          </Button>
          <Space />
          <Button
            onClick={async () => {
              const store = redux.getProjectStore(project_id);
              const listings = store.get_listings();
              await listings.undelete(path);
              if (!isMountedRef.current) return;
              onOpen();
            }}
            type="primary"
          >
            Open
          </Button>
        </div>
      </Card>
    </div>
  );
}
