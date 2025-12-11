"""
Entry point for running the MCP server as a module.

Usage:
    python -m cocalc_api.mcp

Recommended usage (runs in local uv environment):
    uv run cocalc-mcp-server
"""

from .server import main

if __name__ == "__main__":
    main()
