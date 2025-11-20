# CoCalc MCP Server - Development Guide

## Overview

This is the Model Context Protocol (MCP) server for CoCalc, allowing LLMs to interact with CoCalc accounts and projects through a standardized interface.

Learn more about MCP: https://modelcontextprotocol.io/

## Architecture

### Module Structure

```
src/cocalc_api/mcp/
├── server.py                    # Entry point
├── mcp_server.py               # Core initialization & dynamic registration
├── tools/
│   ├── __init__.py            # Dynamic tool registration
│   ├── exec.py                # Shell command tool (project-scoped)
│   ├── jupyter.py             # Jupyter execution tool (project-scoped)
│   └── projects_search.py      # Project search tool (account-scoped)
└── resources/
    ├── __init__.py            # Dynamic resource registration
    ├── file_listing.py        # File browsing (project-scoped)
    └── account_profile.py      # Account info (account-scoped)
```

### Key Design: Dynamic Registration

The server detects your API key type at startup and registers **only the appropriate tools and resources**:

**Account-Scoped Keys** (can access multiple projects):
- Tool: `projects_search` - Find and list projects
- Resource: `account-profile` - View account settings

**Project-Scoped Keys** (limited to one project):
- Tools: `exec`, `jupyter_execute` - Run code in project
- Resource: `project-files` - Browse project files

This design prevents exposing tools that cannot work with a given API key type.

### Initialization Flow

1. `server.py` calls `mcp.run()` which imports `mcp_server`
2. `mcp_server.py` initializes at import time:
   - Creates `FastMCP` instance with instructions and metadata
   - Calls `_initialize_config()` to validate API key and determine scope
   - Calls `_register_tools_and_resources()` which:
     - Checks if key is account-scoped or project-scoped
     - Imports and registers only matching tools/resources
3. Server is ready to handle client requests

### Key Components

**`mcp_server.py`:**
- `_initialize_config()` - Validates API key and detects scope
- `_register_tools_and_resources()` - Registers tools based on scope
- `get_project_client()` - Lazy-loads Project client (for project-scoped keys)
- Global state: `_api_key`, `_host`, `_api_key_scope`

**Tool/Resource Functions:**
- Must be **synchronous** (not async) for FastMCP
- Decorated with `@mcp.tool()` or `@mcp.resource()`
- Access configuration via: `from ..mcp_server import _api_key, _host, _api_key_scope`

## Adding a New Tool

### For Project-Scoped Keys

Create `tools/my_tool.py`:

```python
def register_my_tool(mcp) -> None:
    """Register my tool with FastMCP."""

    @mcp.tool()
    def my_tool(param: str) -> str:
        """Tool description."""
        from ..mcp_server import get_project_client
        project = get_project_client()
        # Use project.system.exec(), project.system.jupyter_execute(), etc.
        return result
```

### For Account-Scoped Keys

Create `tools/my_account_tool.py`:

```python
def register_my_account_tool(mcp) -> None:
    """Register my account tool with FastMCP."""

    @mcp.tool()
    def my_account_tool(param: str) -> str:
        """Tool description."""
        from ..mcp_server import _api_key, _host
        from cocalc_api import Hub

        hub = Hub(api_key=_api_key, host=_host)
        # Use hub.projects.get(), hub.system.user_search(), etc.
        return result
```

### Register the Tool

Update `tools/__init__.py` to import and register in `_register_tools_and_resources()` in `mcp_server.py`:

```python
# In mcp_server.py _register_tools_and_resources()
if account_scoped:
    from .tools.my_account_tool import register_my_account_tool
    register_my_account_tool(mcp)
```

## Testing

### Run Tests

```bash
make test          # Run pytest
make check         # Run ruff, mypy, pyright
```

### Manual Testing

```bash
# Terminal 1: Start the server
export COCALC_API_KEY="sk-your-key"
uv run cocalc-mcp-server

# Terminal 2: Debug the server
uv run cocalc-mcp-debug
```

## Implementation Notes

### Important: Sync, Not Async

MCP tools and resources in FastMCP must be **synchronous functions**, not async:

```python
# ✅ Correct
@mcp.tool()
def my_tool(param: str) -> str:
    return "result"

# ❌ Wrong - will not be callable
@mcp.tool()
async def my_tool(param: str) -> str:
    return "result"
```

### Error Handling

Tools should return error messages as strings, not raise exceptions:

```python
try:
    # Do something
    return result
except Exception as e:
    return f"Error: {str(e)}"
```

### Type Annotations

- All function parameters and return types must be fully typed
- Use `Optional[str]` or `str | None` for optional parameters
- Avoid `Any` type where possible

## Configuration

### Environment Variables

- `COCALC_API_KEY` - API key (required)
- `COCALC_HOST` - CoCalc instance URL (optional, defaults to `https://cocalc.com`)
- `COCALC_PROJECT_ID` - Project ID for project-scoped keys (optional, embedded in key)

### API Key Scope Detection

The server calls `hub.system.test()` to determine scope:
- If returns `account_id` → Account-scoped key
- If returns `project_id` → Project-scoped key

## Available CoCalc APIs

See `../../hub.py` for full API reference:

**Account-Scoped:**
- `hub.projects.get()` - List projects
- `hub.system.user_search()` - Search users
- `hub.db.query()` - Query account data
- `hub.messages.get()` - Get messages

**Project-Scoped:**
- `project.system.exec()` - Run shell commands
- `project.system.jupyter_execute()` - Run code in Jupyter

## Security

1. **API Keys** - Never hardcode; use environment variables
2. **Input Validation** - Validate all user inputs
3. **Error Messages** - Don't leak sensitive info in errors
4. **Permissions** - Check API key has required permissions
5. **Timeouts** - Use reasonable timeouts for long operations

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [FastMCP SDK](https://github.com/modelcontextprotocol/python-sdk)
- [CoCalc API](https://github.com/sagemathinc/cocalc)
