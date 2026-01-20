/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Show a file listing.

// cSpell:ignore issymlink

import { Alert, Button, Spin } from "antd";
import * as immutable from "immutable";
import { useEffect, useRef } from "react";
import { VirtuosoHandle } from "react-virtuoso";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import StatefulVirtuoso from "@cocalc/frontend/components/stateful-virtuoso";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import { path_to_file, rowBackground } from "@cocalc/util/misc";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";
import { BACKUPS } from "@cocalc/frontend/project/listing/use-backups";
import { FileRow } from "./file-row";
import { ListingHeader } from "./listing-header";
import NoFiles from "./no-files";
import { TERM_MODE_CHAR } from "./utils";
import { type DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";
import { useSpecialPathPreview } from "@cocalc/frontend/project/explorer/use-special-path-preview";

interface Props {
  actions: ProjectActions;
  active_file_sort: { column_name: string; is_descending: boolean };
  listing: DirectoryListingEntry[];
  file_search: string;
  checked_files: immutable.Set<string>;
  current_path: string;
  project_id: string;
  shiftIsDown: boolean;
  configuration_main?: MainConfiguration;
  isRunning?: boolean; // true if this project is running
  publicFiles: Set<string>;
  sort_by: (column_name: string) => void;
}

export function FileListing({
  actions,
  active_file_sort,
  listing,
  checked_files,
  current_path,
  project_id,
  shiftIsDown,
  configuration_main,
  file_search = "",
  publicFiles,
  sort_by,
}: Props) {
  const selected_file_index =
    useTypedRedux({ project_id }, "selected_file_index") ?? 0;
  const name = actions.name;
  const openFiles = new Set<string>(
    useTypedRedux({ project_id }, "open_files_order")?.toJS() ?? [],
  );
  const { onOpenSpecial, modal } = useSpecialPathPreview({
    project_id,
    actions,
    current_path,
  });

  function renderRow(index, file) {
    const checked = checked_files.has(path_to_file(current_path, file.name));
    const color = rowBackground({ index, checked });

    return (
      <FileRow
        {...file}
        isOpen={openFiles.has(path_to_file(current_path, file.name))}
        isPublic={publicFiles.has(file.name)}
        color={color}
        checked={checked}
        selected={
          index == selected_file_index && file_search[0] != TERM_MODE_CHAR
        }
        key={index}
        current_path={current_path}
        actions={actions}
        no_select={shiftIsDown}
        listing={listing}
        onOpenSpecial={onOpenSpecial}
      />
    );
  }

  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const lastSelectedFileIndexRef = useRef<undefined | number>(
    selected_file_index,
  );

  useEffect(() => {
    if (selected_file_index == null) {
      return;
    }
    if (lastSelectedFileIndexRef.current == selected_file_index - 1) {
      virtuosoRef.current?.scrollIntoView({ index: selected_file_index + 1 });
    } else {
      virtuosoRef.current?.scrollIntoView({ index: selected_file_index });
    }
    lastSelectedFileIndexRef.current = selected_file_index;
  }, [selected_file_index]);

  if (listing == null) {
    return <Spin delay={500} />;
  }

  function renderRows() {
    return (
      <StatefulVirtuoso
        ref={virtuosoRef}
        cacheId={`${name}${current_path}`}
        increaseViewportBy={2000}
        totalCount={listing.length}
        initialTopMostItemIndex={0}
        itemContent={(index) => {
          const file = listing[index];
          if (file == null) {
            // shouldn't happen
            return <div key={index} style={{ height: "1px" }}></div>;
          }
          return renderRow(index, file);
        }}
      />
    );
  }

  function render_no_files() {
    if (listing.length !== 0) {
      return;
    }
    if (file_search[0] === TERM_MODE_CHAR) {
      return;
    }

    return (
      <NoFiles
        name={name}
        current_path={current_path}
        actions={actions}
        file_search={file_search}
        project_id={project_id}
        configuration_main={configuration_main}
      />
    );
  }

  return (
    <>
      <div
        className="smc-vfill"
        style={{
          flex: "1 0 auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {current_path === SNAPSHOTS ||
        current_path.startsWith(SNAPSHOTS + "/") ? (
          <Alert
            style={{ marginBottom: 8 }}
            type="info"
            showIcon
            message="Snapshots vs Backups"
            description={
              <>
                Snapshots in this folder are fast local readonly filesystem
                checkpoints on the current workspace host, which you can directly
                open or copy. Backups are durable, deduplicated archives stored
                separately, which can only be restored. Use Backups to restore
                files that might be missing from snapshots or if a workspace host
                is not available.
              </>
            }
            action={
              <Button
                size="small"
                onClick={() => actions.open_directory(".backups")}
              >
                Open Backups
              </Button>
            }
          />
        ) : current_path === BACKUPS ||
          current_path.startsWith(BACKUPS + "/") ? (
          <Alert
            style={{ marginBottom: 8 }}
            type="info"
            showIcon
            message="Backups vs Snapshots"
            description={
              <>
                Backups are durable, deduplicated archives stored separately,
                which can only be restored. Snapshots are fast local readonly
                filesystem checkpoints on the current workspace host that you can
                open or copy directly. Use Snapshots for quick local recovery.
              </>
            }
            action={
              <Button
                size="small"
                onClick={() => actions.open_directory(SNAPSHOTS)}
              >
                Open Snapshots
              </Button>
            }
          />
        ) : null}
        <ListingHeader active_file_sort={active_file_sort} sort_by={sort_by} />
        {listing.length > 0 ? renderRows() : render_no_files()}
      </div>
      {modal}
    </>
  );
}
