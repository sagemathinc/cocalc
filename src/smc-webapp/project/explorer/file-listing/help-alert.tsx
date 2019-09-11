import * as React from "react";

const { Alert } = require("react-bootstrap");

const help_alert_error_syle: React.CSSProperties = {
  marginTop: "10px",
  fontWeight: "bold"
};

export function HelpAlert({
  file_search,
  actual_new_filename
}: {
  file_search: string;
  actual_new_filename: string;
}) {
  const last_folder_index = file_search.lastIndexOf("/");
  if (file_search.indexOf("\\") !== -1) {
    return (
      <Alert style={help_alert_error_syle} bsStyle="danger">
        Warning: \ is an illegal character
      </Alert>
    );
  } else if (file_search.indexOf("/") === 0) {
    return (
      <Alert style={help_alert_error_syle} bsStyle="danger">
        Warning: Names cannot begin with /
      </Alert>
    );
  } else if ([".", ".."].indexOf(file_search) > -1) {
    return (
      <Alert style={help_alert_error_syle} bsStyle="danger">
        Warning: Cannot create a file named . or ..
      </Alert>
    );
    // Non-empty search and there is a file divisor ('/')
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
  actual_new_filename
}: {
  last_folder_index: number;
  file_search: string;
  actual_new_filename:string;
}) {
  // Ends with a '/' ie. only folders
  if (last_folder_index === file_search.length - 1) {
    if (last_folder_index !== file_search.indexOf("/")) {
      // More than one sub folder
      return (
        <Alert style={creation_alert_style} bsStyle="info">
          <span style={emphasis_style}>{file_search}</span> will be created as a{" "}
          <span style={emphasis_style}>folder path</span> if non-existant
        </Alert>
      );
    } else {
      // Only one folder
      return (
        <Alert style={creation_alert_style} bsStyle="info">
          Creates a <span style={emphasis_style}>folder</span> named{" "}
          <span style={emphasis_style}>{file_search}</span>
        </Alert>
      );
    }
  } else {
    return (
      <Alert style={creation_alert_style} bsStyle="info">
        <span style={emphasis_style}>
          {actual_new_filename.slice(last_folder_index + 1)}
        </span>{" "}
        will be created under the folder path{" "}
        <span style={emphasis_style}>
          {file_search.slice(0, last_folder_index + 1)}
        </span>
      </Alert>
    );
  }
}
