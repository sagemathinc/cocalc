"""
Project state management tools for account-scoped keys.

Provides tools to set and get the current project for an account-scoped API key,
allowing users to switch between projects and query current project information.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


def register_set_current_project_tool(mcp) -> None:
    """Register the set_current_project tool with the given FastMCP instance."""

    @mcp.tool()
    async def set_current_project(project_id: str) -> str:
        """
        Set the current project for an account-scoped API key.

        After setting a project, all subsequent project-level operations (exec, jupyter_execute, file access)
        will use this project by default. You only need to call this once to switch projects.

        Args:
            project_id: The UUID of the project to work with

        Returns:
            String with project information (title, state) or error message

        Examples:
            Set project after searching:

            >>> set_current_project("c8787b71-a85f-437b-9d1b-29833c3a199e")
            "✓ Project 'Test 01' is now active (state: running)"

            The project is now the default for all subsequent operations.
        """
        from ..mcp_server import set_current_project as _set_current_project

        try:
            result = _set_current_project(project_id)
            state = result.get("state", "unknown")
            title = result.get("title", "Untitled")
            return f"✓ Project '{title}' is now active (state: {state})"
        except Exception as e:
            return f"Error setting project: {str(e)}"


def register_get_current_project_tool(mcp) -> None:
    """Register the get_current_project tool with the given FastMCP instance."""

    @mcp.tool()
    async def get_current_project() -> str:
        """
        Get information about the currently active project.

        Use this to check which project is active before running commands.

        Returns:
            String with current project information or "no project set"

        Examples:
            Check the active project:

            >>> get_current_project()
            "Current project: 'Test 01' (c8787b71-a85f-437b-9d1b-29833c3a199e)"
            "State: running | Last edited: 2025-11-21 13:35 UTC"
        """
        from ..mcp_server import get_current_project as _get_current_project

        try:
            result = _get_current_project()
            if not result:
                return "No project currently set. Use set_current_project(project_id) to select one."
            if "error" in result:
                return f"Error: {result['error']}"

            title = result.get("title", "Untitled")
            project_id = result.get("project_id", "?")
            state = result.get("state", "unknown")
            last_edited = result.get("last_edited", "unknown")

            return f"""Current project: '{title}' ({project_id})
State: {state} | Last edited: {last_edited}"""
        except Exception as e:
            return f"Error getting current project: {str(e)}"
