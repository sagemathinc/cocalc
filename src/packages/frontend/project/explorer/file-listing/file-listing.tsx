/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Show a file listing.

// cSpell:ignore issymlink

import { Spin } from "antd";
import * as immutable from "immutable";
import { useEffect, useRef } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import { path_to_file, rowBackground } from "@cocalc/util/misc";
import { FileRow } from "./file-row";
import { ListingHeader } from "./listing-header";
import NoFiles from "./no-files";
import { TERM_MODE_CHAR } from "./utils";
import { type DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";

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
  const computeServerId = useTypedRedux({ project_id }, "compute_server_id");
  const selected_file_index =
    useTypedRedux({ project_id }, "selected_file_index") ?? 0;
  const name = actions.name;
  const openFiles = new Set<string>(
    useTypedRedux({ project_id }, "open_files_order")?.toJS() ?? [],
  );

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
        computeServerId={computeServerId}
        listing={listing}
      />
    );
  }

  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: name + current_path,
  });
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
      <Virtuoso
        ref={virtuosoRef}
        increaseViewportBy={2000}
        totalCount={listing.length}
        itemContent={(index) => {
          const file = listing[index];
          if (file == null) {
            // shouldn't happen
            return <div key={index} style={{ height: "1px" }}></div>;
          }
          return renderRow(index, file);
        }}
        {...virtuosoScroll}
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
        <ListingHeader active_file_sort={active_file_sort} sort_by={sort_by} />
        {listing.length > 0 ? renderRows() : render_no_files()}
      </div>
    </>
  );
}
