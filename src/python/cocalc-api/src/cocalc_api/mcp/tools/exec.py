"""
Execute shell commands in CoCalc project.

Provides the 'exec' tool that allows running arbitrary shell commands
in the target CoCalc project environment.
"""

from typing import Any
from mcp.types import Tool, TextContent


class ExecTool:
    """Tool for executing shell commands in a CoCalc project."""

    def __init__(self, project_client):
        """
        Initialize the exec tool.

        Args:
            project_client: Initialized Project client from cocalc_api
        """
        self.project_client = project_client

    def definition(self) -> Tool:
        """Return the MCP tool definition."""
        return Tool(
            name="exec",
            description="Execute a shell command in the CoCalc project",
            inputSchema={
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The command to execute (e.g., 'ls -la', 'python script.py')",
                    },
                    "args": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional command arguments",
                    },
                    "bash": {
                        "type": "boolean",
                        "description": "If true, interpret command as bash script",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Timeout in seconds",
                    },
                    "cwd": {
                        "type": "string",
                        "description": "Working directory (relative to home or absolute)",
                    },
                },
                "required": ["command"],
            },
        )

    async def execute(self, arguments: dict[str, Any]) -> list[TextContent]:
        """
        Execute the command and return results.

        Args:
            arguments: Tool arguments from MCP request

        Returns:
            List of TextContent with stdout, stderr, and exit_code
        """
        try:
            command = arguments.get("command")
            args = arguments.get("args")
            bash = arguments.get("bash", False)
            timeout = arguments.get("timeout")
            cwd = arguments.get("cwd")

            if not command:
                return [
                    TextContent(
                        type="text",
                        text="Error: 'command' parameter is required",
                    )
                ]

            result = self.project_client.system.exec(
                command=command,
                args=args,
                bash=bash,
                timeout=timeout,
                cwd=cwd,
            )

            output = f"stdout:\n{result['stdout']}\n\nstderr:\n{result['stderr']}\n\nexit_code: {result['exit_code']}"

            return [TextContent(type="text", text=output)]

        except Exception as e:
            return [
                TextContent(
                    type="text",
                    text=f"Error executing command: {str(e)}",
                )
            ]
