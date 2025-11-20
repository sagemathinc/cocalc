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
from typing import Optional

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
            is_retryable = any(
                keyword in error_msg
                for keyword in ["timeout", "closed", "connection", "reset", "broken"]
            )
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
            # If it's a project-scoped key error, use a placeholder project_id
            # Project-scoped keys have the project_id embedded in the key itself
            if "project-scoped" in str(check_error):
                # Use empty string as project_id - the Project client will extract it from the API key
                _api_key_scope = {"project_id": ""}
                print("✓ Connected with project-scoped API key", file=sys.stderr)
            else:
                raise

        if "account_id" in _api_key_scope:
            account_id = _api_key_scope["account_id"]
            print(f"✓ Connected with account-scoped API key (account: {account_id})", file=sys.stderr)
        elif "project_id" in _api_key_scope:
            project_id = _api_key_scope["project_id"]
            # For project-scoped keys with empty/None project_id, the Project client will extract it from the API key
            if project_id:
                print(f"✓ Connected with project-scoped API key (project: {project_id})", file=sys.stderr)
                # For project-scoped keys, eagerly create the project client
                client = Project(api_key=_api_key, project_id=project_id, host=_host)
                _project_clients[project_id] = client
            else:
                # Project-scoped key with empty project_id - will be discovered on first use
                print("✓ Connected with project-scoped API key (project ID will be discovered on first use)", file=sys.stderr)
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

    # For project-scoped keys with None/empty project_id, the Project client will extract it from the API key
    # For account-scoped keys, project_id must be non-empty
    if not project_id and _api_key_scope and "account_id" in _api_key_scope:
        raise RuntimeError("Account-scoped API key requires a non-empty project_id")

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


def _register_tools_and_resources() -> None:
    """Register tools and resources based on API key scope."""
    global _api_key_scope

    _initialize_config()

    # Determine which tools/resources to register based on API key scope
    if _api_key_scope and "account_id" in _api_key_scope:
        # Account-scoped key: register account-scoped tools/resources
        print("Registering account-scoped tools and resources...", file=sys.stderr)
        from .tools.projects_search import register_projects_search_tool
        from .resources.account_profile import register_account_profile_resource

        register_projects_search_tool(mcp)
        register_account_profile_resource(mcp)

    elif _api_key_scope and "project_id" in _api_key_scope:
        # Project-scoped key: register project-scoped tools/resources
        print("Registering project-scoped tools and resources...", file=sys.stderr)
        from .tools.exec import register_exec_tool
        from .tools.jupyter import register_jupyter_tool
        from .resources.file_listing import register_file_listing_resource

        register_exec_tool(mcp)
        register_jupyter_tool(mcp)
        register_file_listing_resource(mcp)


# Initialize configuration and validate API key at startup, then register tools/resources
_register_tools_and_resources()
