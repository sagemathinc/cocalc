"""
MCP Server for CoCalc API.

Main entry point for the Model Context Protocol server that provides
LLM access to CoCalc projects.

Usage (local):
    export COCALC_API_KEY="sk-..."
    export COCALC_PROJECT_ID="project-uuid"
    uv run cocalc-mcp-server

Usage (Claude Desktop config):
    {
      "mcpServers": {
        "cocalc": {
          "command": "uv",
          "args": ["run", "cocalc-mcp-server"],
          "env": {
            "COCALC_API_KEY": "sk-...",
            "COCALC_PROJECT_ID": "..."
          }
        }
      }
    }
"""

import os
import sys
import asyncio

from mcp.server import Server
from mcp.types import Resource, TextContent, TextResourceContents
from pydantic.networks import AnyUrl

from cocalc_api import Project
from .tools.exec import ExecTool
from .resources.file_listing import ProjectFilesResource


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


async def _run_server():
    """Async implementation of the MCP server."""

    # Get configuration
    try:
        api_key, project_id, host = get_config()
    except RuntimeError as e:
        print(f"Configuration Error: {e}", file=sys.stderr)
        sys.exit(1)

    # Initialize Project client
    try:
        project_client = Project(api_key=api_key, project_id=project_id, host=host)

        # Verify project is accessible
        print(f"Connecting to project {project_id}...", file=sys.stderr)
        project_client.system.ping()
        print(f"✓ Connected to project {project_id}", file=sys.stderr)
    except Exception as e:
        print(
            f"Error: Could not connect to project {project_id}: {e}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Initialize MCP server
    server = Server("cocalc-api")

    # Initialize tools
    exec_tool = ExecTool(project_client)
    project_files_resource = ProjectFilesResource(project_client)

    # Register tools
    @server.list_tools()
    async def list_tools():
        """List available tools."""
        return [exec_tool.definition()]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict):
        """Execute a tool."""
        if name == "exec":
            return await exec_tool.execute(arguments)
        else:
            return [
                TextContent(
                    type="text",
                    text=f"Unknown tool: {name}",
                )
            ]

    # Register resources
    @server.list_resources()
    async def list_resources():
        """List available resources."""
        return [
            Resource(
                uri=project_files_resource.uri_template(),  # type: ignore
                name="project-files",
                description=project_files_resource.description(),
                mimeType="text/plain",
            )
        ]

    @server.read_resource()  # type: ignore
    async def read_resource(uri: AnyUrl):
        """Read a resource."""
        if str(uri).startswith("cocalc://project-files"):
            result = await project_files_resource.read(str(uri))
            return result.contents  # type: ignore
        else:
            # Return error for unknown resources
            return [
                TextResourceContents(
                    uri=uri,
                    text=f"Unknown resource: {uri}",
                )
            ]

    # Start server
    print(
        f"Starting CoCalc API MCP Server for project {project_id}...",
        file=sys.stderr,
    )
    async with server:  # type: ignore
        print("Server is running. Press Ctrl+C to exit.", file=sys.stderr)
        # Run the server indefinitely
        while True:
            await asyncio.sleep(1)


def main():
    """Entry point for the MCP server."""
    asyncio.run(_run_server())


if __name__ == "__main__":
    main()
