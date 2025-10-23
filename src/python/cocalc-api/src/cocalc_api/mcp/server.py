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

1. Local Testing (Project-Scoped API Key - Recommended):
    export COCALC_API_KEY="sk-..."
    uv run cocalc-mcp-server

2. Local Testing (Account-Scoped API Key):
    export COCALC_API_KEY="sk-..."
    uv run cocalc-mcp-server

3. Claude Desktop config (~/.config/Claude/claude_desktop_config.json):
    {
      "mcpServers": {
        "cocalc": {
          "command": "uv",
          "args": ["run", "cocalc-mcp-server"],
          "env": {
            "COCALC_API_KEY": "sk-..."
          }
        }
      }
    }

4. Claude Code CLI:
    export COCALC_API_KEY="sk-..."
    claude mcp add --transport stdio cocalc --env COCALC_API_KEY -- uv run cocalc-mcp-server
"""

import os
import sys


def main():
    """Entry point for the MCP server."""
    # Check and display configuration BEFORE importing mcp_server
    api_key = os.environ.get("COCALC_API_KEY")
    host = os.environ.get("COCALC_HOST")

    print("Starting CoCalc MCP Server...", file=sys.stderr)

    if not api_key:
        print("Error: COCALC_API_KEY environment variable is not set", file=sys.stderr)
        print("Required: COCALC_API_KEY - CoCalc API key (account-scoped or project-scoped)", file=sys.stderr)
        print("Optional: COCALC_HOST - CoCalc instance URL (defaults to https://cocalc.com)", file=sys.stderr)
        sys.exit(1)

    print("Configuration:", file=sys.stderr)
    # Obfuscate API key: show only last 6 characters
    obfuscated_key = f"*****{api_key[-6:]}" if len(api_key) > 6 else "*****"
    print(f"  COCALC_API_KEY: {obfuscated_key}", file=sys.stderr)
    if host:
        print(f"  COCALC_HOST: {host}", file=sys.stderr)

    # Import the mcp_server module which initializes and registers everything
    # This must happen AFTER configuration validation
    from .mcp_server import mcp  # noqa: F401, E402

    # mcp is already initialized and has all tools/resources registered
    # We just need to run it
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
