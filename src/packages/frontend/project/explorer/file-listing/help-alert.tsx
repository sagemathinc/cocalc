/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { Alert } from "antd";

import { Text } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

/**
 * Floating alert shown below the search input when the user is typing
 * a filename (not just filtering).  Three states:
 *
 * 1. **Hidden** — search text has no "." and doesn't end with "/" → pure filter
 * 2. **Error** — illegal characters or names (backslash, leading /, . or ..)
 * 3. **Info** — "Shift+Return creates <filename>"
 */
export function HelpAlert({
  file_search,
  actual_new_filename,
}: {
  file_search: string;
  actual_new_filename: string;
}) {
  // --- Error checks (always take priority) ---
  if (file_search.indexOf("\\") !== -1) {
    return (
      <ErrorAlert message="Warning: \ is an illegal character in filenames" />
    );
  }
  if (file_search.indexOf("/") === 0) {
    return <ErrorAlert message="Warning: Names cannot begin with /" />;
  }
  if (file_search === "." || file_search === "..") {
    return <ErrorAlert message="Warning: Cannot create a file named . or .." />;
  }

  // --- Creation hint: only when the text looks like a filename ---
  const hasDot = file_search.includes(".");
  const endsWithSlash = file_search.endsWith("/");

  if (!hasDot && !endsWithSlash) {
    // Pure filter — no alert
    return null;
  }

  // Nested path hints
  const lastFolderIndex = file_search.lastIndexOf("/");
  let message: React.ReactNode;

  if (endsWithSlash) {
    if (lastFolderIndex > 0 && lastFolderIndex === file_search.length - 1) {
      // e.g. "foo/bar/" — nested folder path
      message = (
        <>
          <Text keyboard>
            <span style={{ color: COLORS.GRAY_D }}>Shift+Return</span>
          </Text>{" "}
          creates folder path <strong>{file_search}</strong>
        </>
      );
    } else {
      // e.g. "foo/" — single folder
      message = (
        <>
          <Text keyboard>
            <span style={{ color: COLORS.GRAY_D }}>Shift+Return</span>
          </Text>{" "}
          creates folder <strong>{file_search}</strong>
        </>
      );
    }
  } else if (lastFolderIndex > 0) {
    // e.g. "foo/bar.py" — file in a subfolder
    message = (
      <>
        <Text keyboard>
          <span style={{ color: "var(--cocalc-text-primary, black)" }}>Shift+Return</span>
        </Text>{" "}
        creates{" "}
        <strong>{actual_new_filename.slice(lastFolderIndex + 1)}</strong> in
        folder <strong>{file_search.slice(0, lastFolderIndex + 1)}</strong>
      </>
    );
  } else {
    // Simple filename with dot, e.g. "notes.md"
    message = (
      <>
        <Text keyboard>
          <span style={{ color: "var(--cocalc-text-primary, black)" }}>Shift+Return</span>
        </Text>{" "}
        creates <strong>{actual_new_filename}</strong>
      </>
    );
  }

  return <Alert type="info" showIcon message={message} />;
}

function ErrorAlert({ message }: { message: string }) {
  return <Alert type="error" showIcon message={message} />;
}
