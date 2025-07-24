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
  AppRedux,
  Rendered,
  TypedMap,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import * as misc from "@cocalc/util/misc";
import { FileRow } from "./file-row";
import { ListingHeader } from "./listing-header";
import NoFiles from "./no-files";
import { TERM_MODE_CHAR } from "./utils";
import ShowError from "@cocalc/frontend/components/error";
import useFs from "@cocalc/frontend/project/listing/use-fs";
import useListing, {
  type SortField,
} from "@cocalc/frontend/project/listing/use-listing";
import filterListing from "@cocalc/frontend/project/listing/filter-listing";

interface Props {
  // TODO: everything but actions/redux should be immutable JS data, and use shouldComponentUpdate
  actions: ProjectActions;
  redux: AppRedux;

  name: string;
  active_file_sort: TypedMap<{ column_name: string; is_descending: boolean }>;
  listing: any[];
  file_search: string;
  checked_files: immutable.Set<string>;
  current_path: string;
  selected_file_index?: number;
  project_id: string;
  shift_is_down: boolean;
  sort_by: (heading: string) => void;
  library?: object;
  other_settings?: immutable.Map<any, any>;
  last_scroll_top?: number;
  configuration_main?: MainConfiguration;
  isRunning?: boolean; // true if this project is running

  show_hidden?: boolean;
  show_masked?: boolean;

  stale?: boolean;
}

function sortDesc(active_file_sort?): {
  sortField: SortField;
  sortDirection: "asc" | "desc";
} {
  const { column_name, is_descending } = active_file_sort?.toJS() ?? {
    column_name: "name",
    is_descending: false,
  };
  if (column_name == "time") {
    return {
      sortField: "mtime",
      sortDirection: is_descending ? "asc" : "desc",
    };
  }
  return {
    sortField: column_name,
    sortDirection: is_descending ? "desc" : "asc",
  };
}

export function FileListing(props) {
  const fs = useFs({ project_id: props.project_id });
  let { listing, error } = useListing({
    fs,
    path: props.current_path,
    ...sortDesc(props.active_file_sort),
    cacheId: { project_id: props.project_id },
  });
  if (error) {
    return <ShowError error={error} />;
  }

  listing = filterListing({
    listing,
    search: props.file_search,
    showHidden: props.show_hidden,
  });

  if (listing == null) {
    return <Spin delay={500} />;
  }
  return <FileListing0 {...{ ...props, listing }} />;
}

function FileListing0({
  actions,
  redux,
  name,
  active_file_sort,
  listing,
  checked_files,
  current_path,
  selected_file_index,
  project_id,
  shift_is_down,
  sort_by,
  configuration_main,
  file_search = "",
  stale,
  // show_masked,
}: Props) {
  const computeServerId = useTypedRedux({ project_id }, "compute_server_id");

  function render_row(
    name,
    size,
    time,
    mask,
    isdir,
    display_name,
    public_data,
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
        display_name={display_name}
        time={time}
        size={isdir ? undefined : size}
        issymlink={issymlink}
        color={color}
        selected={
          index == selected_file_index && file_search[0] != TERM_MODE_CHAR
        }
        mask={mask}
        public_data={public_data}
        is_public={false}
        checked={checked}
        key={index}
        current_path={current_path}
        actions={actions}
        no_select={shift_is_down}
        link_target={link_target}
        computeServerId={computeServerId}
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
            a.display_name,
            a.public,
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
        <ListingHeader active_file_sort={active_file_sort} sort_by={sort_by} />
        {listing.length > 0 ? render_rows() : render_no_files()}
      </div>
    </>
  );
}
