"""
CoCalc MCP (Model Context Protocol) Server - Central Coordination Module

This MCP server gives you direct access to a CoCalc project or account environment.

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
- COCALC_API_KEY: Your CoCalc API authentication token (account-scoped or project-scoped)
- COCALC_HOST: (optional) Your CoCalc instance URL (defaults to https://cocalc.com)

The server will validate your API key on startup and report whether it's account-scoped or project-scoped.
"""

import os
import sys
from typing import Optional

from mcp.server.fastmcp import FastMCP

from cocalc_api import Project, Hub


def get_config() -> tuple[str, str, Optional[str]]:
    """
    Get and validate MCP server configuration.

    Returns:
        Tuple of (api_key, host, project_id)

    Raises:
        RuntimeError: If required configuration is missing
    """
    api_key = os.environ.get("COCALC_API_KEY")
    host = os.environ.get("COCALC_HOST", "https://cocalc.com")
    project_id = os.environ.get("COCALC_PROJECT_ID")

    if not api_key:
        raise RuntimeError("COCALC_API_KEY environment variable is required but not set")

    return api_key, host, project_id


def check_api_key_scope(api_key: str, host: str) -> dict[str, str]:
    """
    Check if the API key is account-scoped or project-scoped.

    Args:
        api_key: The API key to check
        host: The CoCalc host URL

    Returns:
        dict with either 'account_id' (for account-scoped) or 'project_id' (for project-scoped)

    Raises:
        RuntimeError: If the API key is invalid or scope cannot be determined
    """
    try:
        hub = Hub(api_key=api_key, host=host)

        # Try the hub.system.test() method (only works for account-scoped keys)
        result = hub.system.test()

        # Check which scope is returned
        if "account_id" in result and result["account_id"]:
            return {"account_id": result["account_id"]}
        elif "project_id" in result and result["project_id"]:
            return {"project_id": result["project_id"]}
        else:
            raise RuntimeError("API key test returned neither account_id nor project_id")

    except Exception as e:
        # Check if this looks like a project-scoped key error
        error_msg = str(e)
        if "must be signed in and MUST provide an api key" in error_msg:
            raise RuntimeError("API key appears to be project-scoped. "
                               "Project-scoped keys require the project_id to be specified at the OS level. "
                               "Please set the COCALC_PROJECT_ID environment variable and try again.") from e
        raise RuntimeError(f"API key validation failed: {e}") from e


# Initialize FastMCP server with instructions and documentation
mcp = FastMCP(
    name="CoCalc API MCP Server",
    instructions="""CoCalc MCP Server - Direct Access to CoCalc Projects

This server gives you direct access to a CoCalc project or account environment through the Model Context Protocol (MCP).

WHAT YOU CAN DO:
- Execute arbitrary shell commands in a Linux environment with Python, Node.js, R, Julia, and 100+ tools
- Browse and explore project files to understand structure and contents
- Run code, scripts, and build/test commands
- Work with git repositories, manage packages, process data
- Automate any task that can run in a terminal

HOW TO USE:
1. Start by exploring the project structure using the project-files resource
2. Use the exec tool to run commands, scripts, or programs
3. Combine multiple commands to accomplish complex workflows

EXAMPLES:
- Execute Python: exec with command="python3 script.py --verbose"
- List files: use project-files resource or exec with command="ls -la"
- Run tests: exec with command="pytest tests/" bash=true
- Git operations: exec with command="git log --oneline" in your repository

The project runs in an Ubuntu Linux container with access to the full filesystem and all installed tools.
All operations are scoped to this single project and execute with project user permissions.""",
    website_url="https://cocalc.com/api/python",
)

# Configuration (initialized at startup)
_api_key: Optional[str] = None
_host: Optional[str] = None
_api_key_scope: Optional[dict[str, str]] = None  # Either {"account_id": ...} or {"project_id": ...}

# Lazy-initialized project clients map: project_id -> Project
_project_clients: dict[str, Project] = {}


def _initialize_config() -> None:
    """Initialize configuration and validate API key at startup."""
    global _api_key, _host, _api_key_scope, _project_clients

    if _api_key is not None:
        return  # Already initialized

    # Get configuration
    project_id_config: Optional[str] = None
    try:
        _api_key, _host, project_id_config = get_config()
    except RuntimeError as e:
        print(f"Configuration Error: {e}", file=sys.stderr)
        sys.exit(1)

    # Validate API key and determine scope
    try:
        try:
            _api_key_scope = check_api_key_scope(_api_key, _host)
        except RuntimeError as check_error:
            # If it's a project-scoped key error, try the project API to discover the project_id
            if "project-scoped" in str(check_error):
                try:
                    # Try with empty project_id - project-scoped keys will use their own
                    project = Project(api_key=_api_key, project_id="", host=_host)
                    result = project.system.ping()
                    # Check if the response includes project_id (it shouldn't from ping, but try anyway)
                    if isinstance(result, dict) and "project_id" in result:
                        _api_key_scope = {"project_id": result["project_id"]}
                    else:
                        # If we still don't have it, this is an error
                        raise RuntimeError("Could not determine project_id from project-scoped API key. "
                                           "Please restart with COCALC_PROJECT_ID environment variable.")
                except Exception as project_error:
                    raise RuntimeError(f"Project-scoped API key detected but could not determine project_id. "
                                       f"Error: {project_error}") from project_error
            else:
                raise

        if "account_id" in _api_key_scope:
            account_id = _api_key_scope["account_id"]
            print(f"✓ Connected with account-scoped API key (account: {account_id})", file=sys.stderr)
        elif "project_id" in _api_key_scope:
            project_id = _api_key_scope["project_id"]
            if not project_id:
                raise RuntimeError("Project ID not found for project-scoped API key")
            print(f"✓ Connected with project-scoped API key (project: {project_id})", file=sys.stderr)
            # For project-scoped keys, eagerly create the project client
            client = Project(api_key=_api_key, project_id=project_id, host=_host)
            _project_clients[project_id] = client
        else:
            # If we got here with no project_id but it might be project-scoped, check if COCALC_PROJECT_ID was provided
            if project_id_config:
                _api_key_scope = {"project_id": project_id_config}
                print(f"✓ Using project-scoped API key with explicitly provided project_id (project: {project_id_config})", file=sys.stderr)
                client = Project(api_key=_api_key, project_id=project_id_config, host=_host)
                _project_clients[project_id_config] = client
            else:
                raise RuntimeError("Could not determine API key scope")

    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def get_project_client(project_id: Optional[str] = None) -> Project:
    """
    Get or create a Project client for the given project.

    For project-scoped API keys, project_id is optional (uses the key's project).
    For account-scoped API keys, project_id is required.

    Args:
        project_id: The project UUID. If None, uses the project-scoped key's project.

    Returns:
        Project client for the specified project

    Raises:
        RuntimeError: If project_id cannot be determined or account-scoped key without project_id
    """
    global _project_clients

    _initialize_config()

    # Determine which project_id to use
    if project_id is None:
        # If no project_id provided, try to use the one from project-scoped key
        if _api_key_scope and "project_id" in _api_key_scope:
            project_id = _api_key_scope["project_id"]
        else:
            # Account-scoped key requires explicit project_id
            raise RuntimeError("Account-scoped API key requires an explicit project_id argument. "
                               "No project_id provided to get_project_client().")

    if not project_id:
        raise RuntimeError("Project ID cannot be empty")

    # Return cached client if available
    if project_id in _project_clients:
        return _project_clients[project_id]

    # Create new project client
    # At this point, _api_key and _host are guaranteed to be non-None (set in _initialize_config)
    assert _api_key is not None
    assert _host is not None
    client = Project(api_key=_api_key, project_id=project_id, host=_host)
    _project_clients[project_id] = client
    return client


# Register tools and resources
# This happens at module import time, auto-registering with the mcp instance
from . import tools as tools_module  # noqa: E402
from . import resources as resources_module  # noqa: E402

tools_module.register_tools(mcp)
resources_module.register_resources(mcp)

# Initialize configuration and validate API key at startup
_initialize_config()
