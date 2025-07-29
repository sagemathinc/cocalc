/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Show a file listing.

// cSpell:ignore issymlink

import { Spin } from "antd";
import * as immutable from "immutable";
import { useEffect, useRef } from "react";
import { FormattedMessage } from "react-intl";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import {
  Rendered,
  TypedMap,
  useTypedRedux,
  redux,
} from "@cocalc/frontend/app-framework";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import * as misc from "@cocalc/util/misc";
import { FileRow } from "./file-row";
import { ListingHeader } from "./listing-header";
import NoFiles from "./no-files";
import { TERM_MODE_CHAR } from "./utils";
import { DirectoryListingEntry } from "@cocalc/util/types";

interface Props {
  actions: ProjectActions;
  active_file_sort: TypedMap<{ column_name: string; is_descending: boolean }>;
  listing: DirectoryListingEntry[];
  file_search: string;
  checked_files: immutable.Set<string>;
  current_path: string;
  project_id: string;
  shiftIsDown: boolean;
  configuration_main?: MainConfiguration;
  isRunning?: boolean; // true if this project is running
  stale?: boolean;
}

export function FileListing({
  actions,
  listing,
  checked_files,
  current_path,
  project_id,
  shiftIsDown,
  configuration_main,
  file_search = "",
  stale,
}: Props) {
  const active_file_sort = useTypedRedux({ project_id }, "active_file_sort");
  const computeServerId = useTypedRedux({ project_id }, "compute_server_id");
  const selected_file_index =
    useTypedRedux({ project_id }, "selected_file_index") ?? 0;
  const name = actions.name;

  function render_row(
    name,
    size,
    time,
    mask,
    isdir,
    issymlink,
    index: number,
    link_target?: string, // if given, is a known symlink to this file
  ): Rendered {
    const checked = checked_files.has(misc.path_to_file(current_path, name));
    const color = misc.rowBackground({ index, checked });

    return (
      <FileRow
        isdir={isdir}
        name={name}
        time={time}
        size={isdir ? undefined : size}
        issymlink={issymlink}
        color={color}
        selected={
          index == selected_file_index && file_search[0] != TERM_MODE_CHAR
        }
        mask={mask}
        is_public={false}
        checked={checked}
        key={index}
        current_path={current_path}
        actions={actions}
        no_select={shiftIsDown}
        link_target={link_target}
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

  function render_rows(): Rendered {
    return (
      <Virtuoso
        ref={virtuosoRef}
        increaseViewportBy={2000}
        totalCount={listing.length}
        itemContent={(index) => {
          const a = listing[index];
          if (a == null) {
            // shouldn't happen
            return <div key={index} style={{ height: "1px" }}></div>;
          }
          return render_row(
            a.name,
            a.size,
            a.mtime,
            a.mask,
            a.isdir,
            a.issymlink,
            index,
            a.link_target,
          );
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
      {stale && (
        <div
          style={{ textAlign: "center", marginBottom: "5px", fontSize: "12pt" }}
        >
          <FormattedMessage
            id="project.explorer.file-listing.stale-warning"
            defaultMessage={`Showing stale directory listing.
              To update the directory listing <a>start this project</a>.`}
            values={{
              a: (c) => (
                <a
                  onClick={() => {
                    redux.getActions("projects").start_project(project_id);
                  }}
                >
                  {c}
                </a>
              ),
            }}
          />
        </div>
      )}
      <div
        className="smc-vfill"
        style={{
          flex: "1 0 auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ListingHeader
          active_file_sort={active_file_sort}
          sort_by={actions.set_sorted_file_column}
        />
        {listing.length > 0 ? render_rows() : render_no_files()}
      </div>
    </>
  );
}
