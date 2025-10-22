"""
CoCalc MCP Tools - Available Actions

Tools are actions you can perform in the CoCalc project.

Available Tools:
- exec: Execute shell commands, scripts, and programs in the project environment

See mcp_server.py for overview of all available tools and resources, and guidance
on when to use each one.
"""


def register_tools(mcp) -> None:
    """Register all tools with the given FastMCP instance."""
    from .exec import register_exec_tool

    register_exec_tool(mcp)
