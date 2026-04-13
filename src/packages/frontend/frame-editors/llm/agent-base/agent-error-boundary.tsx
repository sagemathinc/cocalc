/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Error boundary for agent panels.  Catches render-time exceptions and
displays a recoverable error message instead of crashing the editor.
*/

import { Alert, Button } from "antd";
import { Component } from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class AgentErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Alert
          type="error"
          message="Agent crashed"
          description={this.state.error.message}
          action={
            <Button size="small" onClick={() => this.setState({ error: null })}>
              Retry
            </Button>
          }
          style={{ margin: 12 }}
        />
      );
    }
    return this.props.children;
  }
}
