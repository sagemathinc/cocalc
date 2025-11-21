"""
CoCalc MCP Tools - Available Actions

Tools are actions you can perform in the CoCalc project or account.

Tools are dynamically registered based on API key scope:

PROJECT-SCOPED KEYS:
- exec: Execute shell commands, scripts, and programs in the project environment
- jupyter_execute: Execute code using Jupyter kernels with rich output and interactive state

ACCOUNT-SCOPED KEYS:
- projects_search: Search for and list projects you have access to

See mcp_server.py for overview of all available tools and resources.

Note: Individual tool registration functions are imported directly by mcp_server.py.
"""
