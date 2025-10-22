"""
CoCalc MCP Resources - Available Information

Resources are read-only information you can access about the CoCalc project.

Available Resources:
- project-files: Browse and list files in the project directory structure

See mcp_server.py for overview of all available tools and resources, and guidance
on when to use each one.
"""


def register_resources(mcp) -> None:
    """Register all resources with the given FastMCP instance."""
    from .file_listing import register_file_listing_resource

    register_file_listing_resource(mcp)
