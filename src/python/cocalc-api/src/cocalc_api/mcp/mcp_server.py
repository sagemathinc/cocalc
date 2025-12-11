"""
CoCalc MCP (Model Context Protocol) Server - Central Coordination Module

This MCP server gives you direct access to a CoCalc project or account environment.
The available tools and resources depend on your API key type (account-scoped or project-scoped).

AVAILABLE TOOLS - PROJECT-SCOPED KEYS:
- exec: Run shell commands, scripts, and programs in the project
  Use for: running code, data processing, build/test commands, git operations, etc.
- jupyter_execute: Execute code using Jupyter kernels (Python, R, Julia, etc.)
  Use for: interactive code execution, data analysis, visualization, scientific computing

AVAILABLE TOOLS - ACCOUNT-SCOPED KEYS:
- projects_search: Search for and list projects you have access to
  Use for: discovering projects, seeing collaborators, checking project states

AVAILABLE RESOURCES - PROJECT-SCOPED KEYS:
- project-files: Browse the project file structure
  Use for: exploring what files exist, understanding project layout, locating files to work with

AVAILABLE RESOURCES - ACCOUNT-SCOPED KEYS:
- account-profile: View your account profile and settings
  Use for: checking personal info, account settings, preferences

HOW IT WORKS:
- Account-scoped keys: Access your account information, manage projects, view profile
- Project-scoped keys: Execute code, run commands, and manage files in a specific project
- All operations are secure and scoped to what your API key authorizes

AUTHENTICATION & CONFIGURATION:
Required environment variables (already set when this server is running):
- COCALC_API_KEY: Your CoCalc API authentication token (account-scoped or project-scoped)
- COCALC_HOST: (optional) Your CoCalc instance URL (defaults to https://cocalc.com)
- COCALC_PROJECT_ID: (optional) Project ID for project-scoped keys

The server will validate your API key on startup and automatically register the appropriate
tools and resources based on whether it's account-scoped or project-scoped.
"""

import os
import sys
import time
from typing import Any, Optional, TypedDict, Union, cast

from mcp.server.fastmcp import FastMCP

from cocalc_api import Project, Hub


def _retry_with_backoff(func, max_retries: int = 3, retry_delay: int = 2):
    """
    Retry a function with exponential backoff for transient failures.

    Used during server initialization for operations that may timeout on cold starts.
    """
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            error_msg = str(e).lower()
            is_retryable = any(keyword in error_msg for keyword in ["timeout", "closed", "connection", "reset", "broken"])
            if is_retryable and attempt < max_retries - 1:
                print(
                    f"Initialization attempt {attempt + 1} failed ({error_msg[:50]}...), "
                    f"retrying in {retry_delay}s...",
                    file=sys.stderr,
                )
                time.sleep(retry_delay)
            else:
                raise


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


class AccountScope(TypedDict):
    account_id: str


class ProjectScope(TypedDict):
    project_id: str


Scope = Union[AccountScope, ProjectScope]


def check_api_key_scope(api_key: str, host: str) -> Scope:
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
    # Try account scope first; hub.system.test only works for account-scoped keys
    try:
        result = Hub(api_key=api_key, host=host).system.test()
        account_id = result.get("account_id")
        if account_id:
            return {"account_id": account_id}
    except Exception:
        pass

    # Fall back to project scope
    try:
        result = Project(api_key=api_key, host=host).system.test()
        project_id = result.get("project_id")
        if project_id:
            return {"project_id": project_id}
    except Exception as e:
        raise RuntimeError(f"API key validation failed: {e}") from e

    raise RuntimeError("API key test returned neither account_id nor project_id")


# Initialize FastMCP server with instructions and documentation
mcp = FastMCP(
    name="CoCalc API MCP Server",
    instructions="""CoCalc MCP Server - Direct Access to CoCalc Projects

This server gives you direct access to a CoCalc project or account environment through the Model Context Protocol (MCP).

WHAT YOU CAN DO:
- Execute code using Jupyter kernels (Python, R, Julia, etc.) with rich output and visualization support
- Execute arbitrary shell commands in a Linux environment with Python, Node.js, R, Julia, and 100+ tools
- Browse and explore project files to understand structure and contents
- Run code, scripts, and build/test commands
- Work with git repositories, manage packages, process data
- Automate any task that can run in a terminal

HOW TO USE:
1. Start by exploring the project structure using the project-files resource
2. Use jupyter_execute for interactive code execution with rich output (plots, tables, etc.)
3. Use exec tool to run shell commands, scripts, or programs
4. Combine multiple commands to accomplish complex workflows

EXAMPLES:
- Execute Python interactively: jupyter_execute with input="import pandas as pd; df = pd.read_csv('data.csv'); df.describe()"
- Data visualization: jupyter_execute with input="import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.show()"
- Execute shell command: exec with command="python3 script.py --verbose"
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
_api_key_scope: Optional[Scope] = None  # Either {"account_id": ...} or {"project_id": ...}

# Lazy-initialized project clients map: project_id -> Project
_project_clients: dict[str, Project] = {}

# Current project management (for account-scoped keys to switch between projects)
_current_project_id: Optional[str] = None


def _update_scope_with_current_project() -> None:
    """Update _api_key_scope to include current_project_id for account-scoped keys."""
    global _api_key_scope, _current_project_id
    if _api_key_scope and "account_id" in _api_key_scope and _current_project_id:
        _api_key_scope["project_id"] = _current_project_id  # type: ignore


def _initialize_config() -> None:
    """Initialize configuration and validate API key at startup."""
    global _api_key, _host, _api_key_scope, _project_clients, _current_project_id

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
        _api_key_scope = check_api_key_scope(_api_key, _host)

        scope = _api_key_scope
        if scope is None:
            raise RuntimeError("Could not determine API key scope")

        if "account_id" in scope:
            account_id = cast(AccountScope, scope)["account_id"]
            print(f"✓ Connected with account-scoped API key (account: {account_id})", file=sys.stderr)
            # If a project_id is explicitly provided via env, add it to scope
            if project_id_config:
                # Store project_id in scope so tools/resources can use it as fallback
                scope["project_id"] = project_id_config  # type: ignore
                _api_key_scope = scope
                _current_project_id = project_id_config
                client = Project(api_key=_api_key, project_id=project_id_config, host=_host)
                _project_clients[project_id_config] = client
                print(
                    f"✓ Using account-scoped API key with explicitly provided project_id (project: {project_id_config})",
                    file=sys.stderr,
                )
        elif "project_id" in scope:
            project_id = cast(ProjectScope, scope)["project_id"]
            print(f"✓ Connected with project-scoped API key (project: {project_id})", file=sys.stderr)
            # For project-scoped keys, eagerly create the project client
            client = Project(api_key=_api_key, project_id=project_id, host=_host)
            _project_clients[project_id] = client
        else:
            raise RuntimeError("Could not determine API key scope")

    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def get_project_client(project_id: Optional[str] = None) -> Project:
    """
    Get or create a Project client for the given project.

    Project ID resolution (in order of priority):
    1. Explicit project_id parameter
    2. project_id from _api_key_scope (for project-scoped keys or account-scoped keys with COCALC_PROJECT_ID)
    3. Project client extracts it from the API key (for project-scoped keys)

    Args:
        project_id: The project UUID. If None, uses the value from _api_key_scope or the API key itself.

    Returns:
        Project client for the specified project

    Raises:
        RuntimeError: If project_id cannot be determined
    """
    global _project_clients

    _initialize_config()

    # Determine which project_id to use
    if project_id is None:
        # Try to use project_id from scope (works for both project-scoped keys
        # and account-scoped keys with explicit COCALC_PROJECT_ID)
        scope = _api_key_scope
        if scope and "project_id" in scope:
            project_id = cast(ProjectScope, scope)["project_id"]

    # Use a cache key that handles None/empty project_id for project-scoped keys
    cache_key = project_id if project_id else "_default_project"

    # Return cached client if available
    if cache_key in _project_clients:
        return _project_clients[cache_key]

    # Create new project client
    # At this point, _api_key and _host are guaranteed to be non-None (set in _initialize_config)
    assert _api_key is not None
    assert _host is not None
    client = Project(api_key=_api_key, project_id=project_id, host=_host)
    _project_clients[cache_key] = client
    return client


def set_current_project(project_id: str) -> dict[str, Any]:
    """
    Set the current project for an account-scoped API key.
    This creates/caches a project client and updates the scope.

    Args:
        project_id: The UUID of the project to set as current

    Returns:
        dict with project info: project_id, title, status

    Raises:
        RuntimeError: If API key is not account-scoped or project cannot be accessed
    """
    global _current_project_id, _api_key_scope, _project_clients

    _initialize_config()

    # Only account-scoped keys can switch projects
    if not _api_key_scope or "account_id" not in _api_key_scope:
        raise RuntimeError("Only account-scoped API keys can switch projects")

    # Validate that user is collaborator on this project
    assert _api_key is not None
    assert _host is not None
    from cocalc_api import Hub

    try:
        hub = Hub(api_key=_api_key, host=_host)
        projects = hub.projects.get(project_id=project_id)
        if not projects:
            raise RuntimeError(f"Project {project_id} not found or not accessible")
        project_info = projects[0]
    except Exception as e:
        raise RuntimeError(f"Cannot access project {project_id}: {str(e)}") from e

    # Set as current project
    _current_project_id = project_id
    _update_scope_with_current_project()

    # Create/cache the project client for this project
    assert _api_key is not None
    assert _host is not None
    client = Project(api_key=_api_key, project_id=project_id, host=_host)
    _project_clients[project_id] = client

    # Return project info
    return {
        "project_id": project_info.get("project_id"),
        "title": project_info.get("title", "Untitled"),
        "state": project_info.get("state", {}).get("state", "unknown"),
    }


def get_current_project() -> dict[str, Any]:
    """
    Get information about the current project (if set).

    Returns:
        dict with project info if a project is current, else empty dict

    Raises:
        RuntimeError: If API key is not account-scoped
    """
    global _current_project_id, _api_key_scope

    _initialize_config()

    # Only account-scoped keys have "current project" concept
    if not _api_key_scope or "account_id" not in _api_key_scope:
        raise RuntimeError("Only account-scoped API keys have a current project concept")

    if not _current_project_id:
        return {}

    # Fetch current project info
    assert _api_key is not None
    assert _host is not None
    from cocalc_api import Hub

    try:
        hub = Hub(api_key=_api_key, host=_host)
        projects = hub.projects.get(project_id=_current_project_id)
        if not projects:
            return {"error": f"Project {_current_project_id} no longer accessible"}
        project_info = projects[0]
        return {
            "project_id": project_info.get("project_id"),
            "title": project_info.get("title", "Untitled"),
            "state": project_info.get("state", {}).get("state", "unknown"),
            "last_edited": project_info.get("last_edited"),
        }
    except Exception as e:
        return {"error": str(e)}


def _register_tools_and_resources() -> None:
    """Register tools and resources based on API key scope."""
    global _api_key_scope

    _initialize_config()

    # Register tools based on API key type
    is_account_scoped = _api_key_scope and "account_id" in _api_key_scope
    is_project_scoped = _api_key_scope and "project_id" in _api_key_scope

    if is_account_scoped:
        print("Registering account-scoped tools and resources...", file=sys.stderr)
        from .tools.projects_search import register_projects_search_tool
        from .tools.project_state import (
            register_set_current_project_tool,
            register_get_current_project_tool,
        )
        from .resources.account_profile import register_account_profile_resource

        register_projects_search_tool(mcp)
        register_set_current_project_tool(mcp)
        register_get_current_project_tool(mcp)
        register_account_profile_resource(mcp)

    # Register project tools if:
    # - It's a project-scoped key, OR
    # - It's an account-scoped key (so users can switch projects after initial setup)
    if is_project_scoped or is_account_scoped:
        print("Registering project-scoped tools and resources...", file=sys.stderr)
        from .tools.exec import register_exec_tool
        from .tools.jupyter import register_jupyter_tool
        from .tools.project_status import register_project_status_tool
        from .resources.file_listing import register_file_listing_resource

        register_exec_tool(mcp)
        register_jupyter_tool(mcp)
        register_project_status_tool(mcp)
        register_file_listing_resource(mcp)


# Initialize configuration and validate API key at startup, then register tools/resources
_register_tools_and_resources()
