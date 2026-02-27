/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { Alert } from "antd";

const help_alert_error_style: React.CSSProperties = {
  marginTop: "10px",
  fontWeight: "bold",
};

export function HelpAlert({
  file_search,
  actual_new_filename,
}: {
  file_search: string;
  actual_new_filename: string;
}) {
  const last_folder_index = file_search.lastIndexOf("/");
  if (file_search.indexOf("\\") !== -1) {
    return (
      <Alert
        style={help_alert_error_style}
        type="error"
        message="Warning: \ is an illegal character"
      />
    );
  } else if (file_search.indexOf("/") === 0) {
    return (
      <Alert
        style={help_alert_error_style}
        type="error"
        message="Warning: Names cannot begin with /"
      />
    );
  } else if ([".", ".."].indexOf(file_search) > -1) {
    return (
      <Alert
        style={help_alert_error_style}
        type="error"
        message="Warning: Cannot create a file named . or .."
      />
    );
  } else if (file_search.length > 0 && last_folder_index > 0) {
    return (
      <CreationHelpAlert
        last_folder_index={last_folder_index}
        file_search={file_search}
        actual_new_filename={actual_new_filename}
      />
    );
  }
  return null;
}

const creation_alert_style: React.CSSProperties = { marginTop: "10px" };
const emphasis_style: React.CSSProperties = { fontWeight: "bold" };

function CreationHelpAlert({
  last_folder_index,
  file_search,
  actual_new_filename,
}: {
  last_folder_index: number;
  file_search: string;
  actual_new_filename: string;
}) {
  if (last_folder_index === file_search.length - 1) {
    if (last_folder_index !== file_search.indexOf("/")) {
      return (
        <Alert
          style={creation_alert_style}
          type="info"
          message={
            <>
              <span style={emphasis_style}>{file_search}</span> will be created
              as a <span style={emphasis_style}>folder path</span> if
              non-existant
            </>
          }
        />
      );
    } else {
      return (
        <Alert
          style={creation_alert_style}
          type="info"
          message={
            <>
              Creates a <span style={emphasis_style}>folder</span> named{" "}
              <span style={emphasis_style}>{file_search}</span>
            </>
          }
        />
      );
    }
  } else {
    return (
      <Alert
        style={creation_alert_style}
        type="info"
        message={
          <>
            <span style={emphasis_style}>
              {actual_new_filename.slice(last_folder_index + 1)}
            </span>{" "}
            will be created under the folder path{" "}
            <span style={emphasis_style}>
              {file_search.slice(0, last_folder_index + 1)}
            </span>
          </>
        }
      />
    );
  }
}
