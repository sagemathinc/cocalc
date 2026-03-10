/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared closable error alert for agent panels.
*/

import { Alert } from "antd";

interface AgentErrorProps {
  error: string;
  onClose: () => void;
}

export function AgentError({ error, onClose }: AgentErrorProps) {
  if (!error) return null;
  return (
    <Alert
      type="error"
      message={error}
      closable
      onClose={onClose}
      style={{ margin: "4px 12px" }}
    />
  );
}
