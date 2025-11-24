"""
Projects search tool for account-scoped API keys.

Provides the 'projects_search' tool that allows listing and searching
for projects that you have access to.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


def register_projects_search_tool(mcp) -> None:
    """Register the projects search tool with the given FastMCP instance."""

    @mcp.tool()
    def projects_search(
        query: str = "",
        limit: int = 100,
        deleted: bool = False,
        hidden: bool = False,
        state: str | None = None,
    ) -> str:
        """
        Search for and list projects you have access to.

        Use this tool to:
        - List all your projects (default when query is empty)
        - Find projects by title or description
        - See project collaborators and access information
        - Check when projects were last accessed/modified

        Args:
            query (str): Search string to filter projects by title.
                        Default "" lists all projects.
            limit (int): Maximum number of projects to return. Default 100.
            deleted (bool): If True, only show deleted projects. Default False.
            hidden (bool): If True, only show hidden projects; if False, exclude them. Default False.
            state (Optional[str]): Filter by state (e.g., "opened" or "running"). Default None (all states).

        Returns:
            Formatted list of projects with:
            - Project ID (UUID)
            - Project Title
            - Last Accessed timestamp
            - List of collaborators (with resolved names)
            - Project State (running, stopped, etc.)
        """
        try:
            # Import configuration from mcp_server
            from ..mcp_server import _api_key, _host, _api_key_scope
            from cocalc_api import Hub

            # Verify this is an account-scoped key
            if not _api_key_scope or "account_id" not in _api_key_scope:
                return "Error: This tool requires an account-scoped API key"

            if not _api_key or not _host:
                return "Error: API configuration not initialized"

            hub = Hub(api_key=_api_key, host=_host)

            # Normalize limit
            limit = max(0, limit if limit is not None else 100)

            account_id = _api_key_scope.get("account_id")

            # Get all projects with full details
            projects = hub.projects.get(
                all=True,
                fields=[
                    "project_id",
                    "title",
                    "description",
                    "last_edited",
                    "created",
                    "state",
                    "deleted",
                    "users",  # collaborators
                ],
                limit=limit,
                deleted=deleted,
                hidden=hidden,
                state=state,
                account_id_for_hidden=account_id,
            )

            if not projects:
                return "No projects found"

            # Filter by query if provided
            if query:
                projects = [p for p in projects if query.lower() in (p.get("title", "") or "").lower()]
                if not projects:
                    return f"No projects found matching query: '{query}'"

            # Get account IDs for collaborator name resolution
            all_account_ids: set[str] = set()
            for project in projects:
                users = project.get("users", {})
                if isinstance(users, dict):
                    all_account_ids.update(users.keys())

            # Batch fetch user names
            account_names = {}
            if all_account_ids:
                try:
                    names_data = hub.system.get_names(list(all_account_ids))
                    account_names = names_data if isinstance(names_data, dict) else {}
                except Exception:
                    # If get_names fails, we'll just use account IDs
                    pass

            # Format output
            output = []
            output.append("=" * 100)
            output.append(f"PROJECTS ({len(projects)} found)")
            output.append("=" * 100)

            for idx, project in enumerate(projects, 1):
                project_id = project.get("project_id", "Unknown")
                title = project.get("title") or "Untitled Project"
                last_edited = project.get("last_edited", "Never")
                state = project.get("state", "unknown")
                deleted = project.get("deleted", False)

                output.append(f"\n[{idx}] {title}")
                output.append(f"    Project ID:  {project_id}")
                output.append(f"    State:       {state}")
                output.append(f"    Last Edited: {last_edited}")

                if deleted:
                    output.append("    Status:      DELETED")

                # Format collaborators
                users = project.get("users", {})
                if isinstance(users, dict):
                    collaborators = []
                    for account_id, user_info in users.items():
                        # Try to get the user's name
                        if account_id in account_names:
                            name_info = account_names[account_id]
                            if isinstance(name_info, dict):
                                first_name = name_info.get("first_name", "")
                                last_name = name_info.get("last_name", "")
                                user_name = f"{first_name} {last_name}".strip()
                            else:
                                user_name = str(name_info)
                        else:
                            user_name = account_id[:8]  # Show first 8 chars of UUID

                        # Get the role/access level if available
                        access_level = ""
                        if isinstance(user_info, dict):
                            if user_info.get("group") == "owner":
                                access_level = " (owner)"
                            elif user_info.get("group"):
                                access_level = f" ({user_info.get('group')})"

                        collaborators.append(f"{user_name}{access_level}")

                    if collaborators:
                        output.append(f"    Collaborators: {', '.join(collaborators)}")
                else:
                    output.append(f"    Collaborators: {len(users)} users")

            output.append("\n" + "=" * 100)
            return "\n".join(output)

        except Exception as e:
            return f"Error searching projects: {str(e)}"
