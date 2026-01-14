"""
Project status tool for querying detailed project information.

Provides a tool to get comprehensive status information about a specific project,
including state, running processes, disk usage, and memory information.
"""

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    pass


def register_project_status_tool(mcp) -> None:
    """Register the project_status tool with the given FastMCP instance."""

    @mcp.tool()
    async def project_status(project_id: str) -> str:
        """
        Get detailed status information about a specific project.

        This provides a comprehensive summary of what's happening in a project,
        including its current state, running processes, and resource usage.

        Args:
            project_id: The UUID of the project to query

        Returns:
            Formatted string with detailed project status information

        Examples:
            Get status of a project:

            >>> project_status("c8787b71-a85f-437b-9d1b-29833c3a199e")
            "Project Status for 'main test project1' (c8787b71-a85f-437b-9d1b-29833c3a199e)
            State: running
            IP: 127.0.0.1
            Last changed: 2025-11-21T14:55:21.253Z
            ..."
        """
        from cocalc_api import Hub
        from ..mcp_server import _api_key, _host

        try:
            assert _api_key is not None
            assert _host is not None
            hub = Hub(api_key=_api_key, host=_host)

            # Get project state and status via hub API
            state_info = hub.projects.state(project_id)
            status_info = hub.projects.status(project_id)

            # Build formatted output
            lines = [
                f"Project Status for '{project_id}'",
                "=" * 60,
                "",
            ]

            # State information
            if state_info:
                state = state_info.pop("state", "unknown")
                ip = state_info.pop("ip", None)
                error = state_info.pop("error", None)
                time = state_info.pop("time", "unknown")

                # Add comment about the state for clarity
                if state == "running":
                    state_comment = " (project is active)"
                elif state in ("starting", "stopping"):
                    state_comment = f" (project is {state})"
                else:
                    state_comment = " (project is stopped)"

                lines.append("STATE:")
                lines.append(f"  State: {state}{state_comment}")
                if ip:
                    lines.append(f"  IP Address: {ip}")
                if error:
                    lines.append(f"  Error: {error}")
                lines.append(f"  Last Changed: {time}")
                lines.append("")

            # Detailed status information
            if status_info:
                lines.append("RESOURCES:")

                # Process information
                project_dict = status_info.pop("project", {})
                if isinstance(project_dict, dict):
                    pid = project_dict.get("pid")
                    if pid:
                        lines.append(f"  Process ID: {pid}")

                # Timing information
                start_ts = status_info.pop("start_ts", None)
                if start_ts:
                    lines.append(f"  Started At: {start_ts}")

                version = status_info.pop("version", None)
                if version:
                    lines.append(f"  Version: {version}")

                # Disk usage
                disk_mb = status_info.pop("disk_MB", None)
                if disk_mb is not None:
                    lines.append(f"  Disk Usage: {disk_mb} MB")

                # Memory information
                memory = status_info.pop("memory", None)
                if memory:
                    if isinstance(memory, dict):
                        for key, val in memory.items():
                            lines.append(f"  Memory {key}: {val}")
                    else:
                        lines.append(f"  Memory: {memory}")

            # Add remaining fields as JSON if any
            remaining: dict[str, Any] = {}
            if state_info:
                remaining["state_info"] = state_info
            if status_info:
                remaining["status_info"] = status_info

            if remaining:
                lines.append("")
                lines.append("ADDITIONAL INFORMATION:")
                lines.append(json.dumps(remaining, indent=2))

            return "\n".join(lines)

        except RuntimeError as e:
            return f"Error: {str(e)}"
        except Exception as e:
            return f"Error getting project status: {str(e)}"
