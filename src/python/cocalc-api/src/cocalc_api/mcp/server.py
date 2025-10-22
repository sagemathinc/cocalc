"""
MCP Server for CoCalc API.

Main entry point for the Model Context Protocol server that provides LLM access
to CoCalc projects through a standardized protocol. This server bridges LLMs
(like Claude) with CoCalc project environments.

CoCalc MCP enables:
- Executing shell commands and scripts in a CoCalc project
- Browsing and reading project files
- Providing context about project structure and contents
- Complete project lifecycle automation

For detailed architecture and configuration documentation, see mcp_server.py.

Configuration Examples:

1. Local Testing:
    export COCALC_API_KEY="sk-..."
    export COCALC_PROJECT_ID="project-uuid"
    uv run cocalc-mcp-server

2. Claude Desktop config (~/.config/Claude/claude_desktop_config.json):
    {
      "mcpServers": {
        "cocalc": {
          "command": "uv",
          "args": ["run", "cocalc-mcp-server"],
          "env": {
            "COCALC_API_KEY": "sk-...",
            "COCALC_PROJECT_ID": "..."
          }
        }
      }
    }

3. Claude Code CLI:
    export COCALC_API_KEY="sk-..."
    export COCALC_PROJECT_ID="..."
    export COCALC_HOST="https://cocalc.com"
    claude mcp add --transport stdio cocalc --env COCALC_API_KEY --env COCALC_PROJECT_ID --env COCALC_HOST -- uv run cocalc-mcp-server
"""

import sys

# Import the mcp_server module which initializes and registers everything
from .mcp_server import mcp  # noqa: F401


def main():
    """Entry point for the MCP server."""
    print("Starting CoCalc API MCP Server...", file=sys.stderr)
    # mcp is already initialized and has all tools/resources registered
    # We just need to run it
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
