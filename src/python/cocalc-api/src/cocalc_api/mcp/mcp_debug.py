"""
MCP Server Debug Tool

Starts an instance of the MCP server and introspects it to report
available tools, resources, and capabilities.

Usage:
    Set up your API key and run this debug tool:
        export COCALC_API_KEY="sk-..."
        make mcp-debug

    This will spawn a temporary instance of the MCP server, connect to it,
    and print detailed information about available tools and resources.

Note:
    This tool starts its own MCP server instance for introspection.
    You can also run the server persistently with:
        make mcp
"""

import asyncio
import os
import sys

from mcp import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters


async def debug_mcp_server() -> None:
    """Start a temporary MCP server, query it, and report results."""
    try:
        # Start a temporary MCP server instance for introspection
        print("Starting MCP server for introspection...", file=sys.stderr)

        # Connect to the server via stdio
        # Pass the current environment to the subprocess so it inherits API key and host settings
        server_params = StdioServerParameters(
            command="uv",
            args=["run", "cocalc-mcp-server"],
            env=dict(os.environ),
        )
        async with stdio_client(server_params) as client:
            read_stream, write_stream = client
            async with ClientSession(read_stream, write_stream) as session:
                # Initialize the connection
                print("\n=== MCP Server Debug Information ===\n", file=sys.stderr)

                # Get capabilities
                info = await session.initialize()
                print("✓ Server Initialized Successfully\n", file=sys.stderr)

                # Print server information
                print("Server Information:")
                print("=" * 50)
                print(f"Protocol Version: {info.protocolVersion}")
                print(f"Server Name: {info.serverInfo.name}")
                print(f"Server Version: {info.serverInfo.version}")
                if info.serverInfo.websiteUrl:
                    print(f"Website: {info.serverInfo.websiteUrl}")
                if info.serverInfo.title:
                    print(f"Title: {info.serverInfo.title}")
                print("=" * 50 + "\n")

                # Extract and display instructions if available
                if info.instructions:
                    print("\n" + "=" * 50)
                    print("SERVER INSTRUCTIONS")
                    print("=" * 50)
                    print()
                    print(info.instructions)
                    print()
                    print("=" * 50 + "\n")

                # List tools
                print("\n\nAvailable Tools:")
                print("-" * 50)
                tools_list = await session.list_tools()
                if tools_list.tools:
                    for tool in tools_list.tools:
                        print(f"\n  Tool: {tool.name}")
                        print(f"    Description: {tool.description}")
                else:
                    print("  (no tools available)")

                # List resources
                print("\n\nAvailable Resources:")
                print("-" * 50)
                resources_list = await session.list_resources()
                if resources_list.resources:
                    for resource in resources_list.resources:
                        print(f"\n  Resource: {resource.uri}")
                        print(f"    Name: {resource.name}")
                        if resource.description:
                            print(f"    Description: {resource.description}")
                        if hasattr(resource, "mimeType") and resource.mimeType:
                            print(f"    MIME Type: {resource.mimeType}")
                else:
                    print("  (no resources available)")

                print("\n\n✓ Debug Information Complete", file=sys.stderr)

        # Process is automatically terminated when stdio_client context exits

    except Exception as e:
        error_str = str(e)
        if "COCALC_API_KEY" in error_str or "not set" in error_str:
            print("Error: COCALC_API_KEY environment variable is not set", file=sys.stderr)
            print("\nUsage:", file=sys.stderr)
            print("  export COCALC_API_KEY='sk-...'", file=sys.stderr)
            print("  make mcp-debug", file=sys.stderr)
        elif "project_id" in error_str.lower():
            print("Error: Project-scoped API key requires COCALC_PROJECT_ID", file=sys.stderr)
            print("\nFor project-scoped API keys, provide the project ID:", file=sys.stderr)
            print("  export COCALC_API_KEY='sk-...'", file=sys.stderr)
            print("  export COCALC_PROJECT_ID='uuid-...'", file=sys.stderr)
            print("  make mcp-debug", file=sys.stderr)
        else:
            print(f"Error: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
        sys.exit(1)


def main() -> None:
    """Entry point for mcp-debug."""
    asyncio.run(debug_mcp_server())


if __name__ == "__main__":
    main()
