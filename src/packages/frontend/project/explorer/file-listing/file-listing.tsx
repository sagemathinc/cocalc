/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Show a file listing.

// cSpell:ignore issymlink

import { Alert, Spin } from "antd";
import * as immutable from "immutable";
import React, { useEffect, useRef, useState } from "react";
import { useInterval } from "react-interval-hook";
import { FormattedMessage } from "react-intl";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  AppRedux,
  Rendered,
  TypedMap,
  usePrevious,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/nats/listings";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import * as misc from "@cocalc/util/misc";
import { FileRow } from "./file-row";
import { ListingHeader } from "./listing-header";
import NoFiles from "./no-files";
import { TERM_MODE_CHAR } from "./utils";

interface Props {
  // TODO: everything but actions/redux should be immutable JS data, and use shouldComponentUpdate
  actions: ProjectActions;
  redux: AppRedux;

  name: string;
  active_file_sort: TypedMap<{ column_name: string; is_descending: boolean }>;
  listing: any[];
  file_map: object;
  file_search: string;
  checked_files: immutable.Set<string>;
  current_path: string;
  create_folder: (switch_over?: boolean) => void; // TODO: should be action!
  create_file: (ext?: string, switch_over?: boolean) => void; // TODO: should be action!
  selected_file_index?: number;
  project_id: string;
  shift_is_down: boolean;
  sort_by: (heading: string) => void; // TODO: should be data
  library?: object;
  other_settings?: immutable.Map<any, any>;
  last_scroll_top?: number;
  configuration_main?: MainConfiguration;
  isRunning?: boolean; // true if this project is running
}

export function watchFiles({ actions, current_path }): void {
  const store = actions.get_store();
  if (store == null) return;
  try {
    store.get_listings().watch(current_path);
  } catch (err) {
    console.warn("ERROR watching directory", err);
  }
}

export const FileListing: React.FC<Props> = ({
  actions,
  redux,
  name,
  active_file_sort,
  listing,
  file_map,
  checked_files,
  current_path,
  create_folder,
  create_file,
  selected_file_index,
  project_id,
  shift_is_down,
  sort_by,
  configuration_main,
  file_search = "",
  isRunning,
}: Props) => {
  const [starting, setStarting] = useState<boolean>(false);

  const prev_current_path = usePrevious(current_path);

  function watch() {
    watchFiles({ actions, current_path });
  }

  // once after mounting, when changing paths, and in regular intervals call watch()
  useEffect(() => {
    watch();
  }, []);

  useEffect(() => {
    if (current_path != prev_current_path) watch();
  }, [current_path, prev_current_path]);

  useInterval(watch, WATCH_THROTTLE_MS);

  const [missing, setMissing] = useState<number>(0);

  useEffect(() => {
    if (isRunning) return;
    if (listing.length == 0) return;
    (async () => {
      const missing = await redux
        .getProjectStore(project_id)
        .get_listings()
        .getMissingUsingDatabase(current_path);
      setMissing(missing ?? 0);
    })();
  }, [current_path, isRunning]);

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
    const { is_public } = file_map[name];

    return (
      <FileRow
        isdir={isdir}
        name={name}
        display_name={display_name}
        time={time}
        size={size}
        issymlink={issymlink}
        color={color}
        selected={
          index == selected_file_index && file_search[0] != TERM_MODE_CHAR
        }
        mask={mask}
        public_data={public_data}
        is_public={is_public}
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
        increaseViewportBy={10}
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
        create_folder={create_folder}
        create_file={create_file}
        project_id={project_id}
        configuration_main={configuration_main}
      />
    );
  }

  if (!isRunning && listing.length == 0) {
    return (
      <Alert
        style={{
          textAlign: "center",
          margin: "15px auto",
          maxWidth: "400px",
        }}
        showIcon
        type="warning"
        message={
          <div style={{ padding: "30px", fontSize: "14pt" }}>
            <a
              onClick={async () => {
                if (starting) return;
                try {
                  setStarting(true);
                  await actions.fetch_directory_listing_directly(
                    current_path,
                    true,
                  );
                } finally {
                  setStarting(false);
                }
              }}
            >
              Start this project to see your files.
              {starting && <Spin />}
            </a>
          </div>
        }
      />
    );
  }

  return (
    <>
      {!isRunning && listing.length > 0 && (
        <div
          style={{ textAlign: "center", marginBottom: "5px", fontSize: "12pt" }}
        >
          <FormattedMessage
            id="project.explorer.file-listing.stale-warning"
            defaultMessage={`Showing stale directory listing
              {is_missing, select, true {<b>missing {missing} files</b>} other {}}.
              To update the directory listing <a>start this project</a>.`}
            values={{
              is_missing: missing > 0,
              missing,
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
      <Col
        sm={12}
        className="smc-vfill"
        style={{
          flex: "1 0 auto",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {listing.length > 0 && (
          <ListingHeader
            active_file_sort={active_file_sort}
            sort_by={sort_by}
          />
        )}
        {listing.length > 0 && <Row className="smc-vfill">{render_rows()}</Row>}
        {render_no_files()}
      </Col>
    </>
  );
};
