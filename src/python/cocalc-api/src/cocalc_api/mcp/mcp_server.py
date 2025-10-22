"""
CoCalc MCP (Model Context Protocol) Server - Central Coordination Module

This MCP server gives you direct access to a CoCalc project environment.

AVAILABLE TOOLS (actions you can perform):
- exec: Run shell commands, scripts, and programs in the project
  Use for: running code, data processing, build/test commands, git operations, etc.

AVAILABLE RESOURCES (information you can read):
- project-files: Browse the project file structure
  Use for: exploring what files exist, understanding project layout, locating files to work with

HOW IT WORKS:
- You can use these tools and resources to understand, modify, and manage files in the project
- The project runs in an Ubuntu Linux container with common development tools pre-installed
- Commands execute with the permissions of the CoCalc project user
- All operations are scoped to this single project

WHEN TO USE WHICH:
1. First, use project-files to explore and understand the project structure
2. Then, use exec to run commands, edit files, run tests, etc.
3. Use project-files again if you need to navigate to new directories
4. Use exec for anything the project-files resource can't show (recursive listings, complex queries, etc.)

AUTHENTICATION & CONFIGURATION:
Required environment variables (already set when this server is running):
- COCALC_API_KEY: Your CoCalc API authentication token
- COCALC_PROJECT_ID: The UUID of your CoCalc project
- COCALC_HOST: (optional) Your CoCalc instance URL (defaults to https://cocalc.com)
"""

import os
import sys
from typing import Optional

from mcp.server.fastmcp import FastMCP

from cocalc_api import Project


def get_config() -> tuple[str, str, str]:
    """
    Get and validate MCP server configuration.

    Returns:
        Tuple of (api_key, project_id, host)

    Raises:
        RuntimeError: If required configuration is missing
    """
    api_key = os.environ.get("COCALC_API_KEY")
    project_id = os.environ.get("COCALC_PROJECT_ID")
    host = os.environ.get("COCALC_HOST", "https://cocalc.com")

    if not api_key:
        raise RuntimeError(
            "COCALC_API_KEY environment variable is required but not set"
        )
    if not project_id:
        raise RuntimeError(
            "COCALC_PROJECT_ID environment variable is required but not set"
        )

    return api_key, project_id, host


# Initialize FastMCP server
mcp = FastMCP("cocalc-api")

# Project client (initialized below)
_project_client: Optional[Project] = None


def initialize_project_client() -> Project:
    """Initialize and return the Project client."""
    global _project_client

    if _project_client is not None:
        return _project_client

    # Get configuration
    try:
        api_key, project_id, host = get_config()
    except RuntimeError as e:
        print(f"Configuration Error: {e}", file=sys.stderr)
        sys.exit(1)

    # Initialize Project client
    try:
        _project_client = Project(api_key=api_key, project_id=project_id, host=host)

        # Verify project is accessible
        print(f"Connecting to project {project_id}...", file=sys.stderr)
        _project_client.system.ping()
        print(f"✓ Connected to project {project_id}", file=sys.stderr)
    except Exception as e:
        print(
            f"Error: Could not connect to project {project_id}: {e}",
            file=sys.stderr,
        )
        sys.exit(1)

    return _project_client


def get_project_client() -> Project:
    """Get the initialized Project client."""
    global _project_client
    if _project_client is None:
        return initialize_project_client()
    return _project_client


# Register tools and resources
# This happens at module import time, auto-registering with the mcp instance
from . import tools as tools_module  # noqa: E402
from . import resources as resources_module  # noqa: E402

tools_module.register_tools(mcp)
resources_module.register_resources(mcp)
