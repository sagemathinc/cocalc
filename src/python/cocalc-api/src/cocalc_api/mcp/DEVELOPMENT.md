# CoCalc API MCP Server - Development Guide

## Overview

This directory contains the **Model Context Protocol (MCP) server** for CoCalc API. It allows LLMs (via Claude Code, Claude Desktop) to interact with CoCalc projects through a standardized protocol.

Learn more: https://modelcontextprotocol.io/docs/getting-started/intro

## Configuration

### Required Environment Variables

- **`COCALC_API_KEY`** - API key for CoCalc authentication (format: `sk-...`, can be account-scoped or project-scoped)
- **`COCALC_HOST`** (optional) - CoCalc instance URL (default: `https://cocalc.com`)

### Setup Examples

**Local Development (Recommended: Project-Scoped API Key):**

Create a project-scoped API key in your CoCalc project settings:

```bash
export COCALC_API_KEY="sk-your-project-api-key-here"
export COCALC_HOST="http://localhost:5000"  # For local CoCalc, or omit for cocalc.com
uv run cocalc-mcp-server
```

When started, the server will report:

```
✓ Connected with project-scoped API key (project: 6e75dbf1-0342-4249-9dce-6b21648656e9)
```

**Alternative: Account-Scoped API Key:**

Create an account-scoped API key in your CoCalc account settings (Settings → API keys):

```bash
export COCALC_API_KEY="sk-your-account-api-key-here"
uv run cocalc-mcp-server
```

When started, the server will report:

```
✓ Connected with account-scoped API key (account: d0bdabfd-850e-4c8d-8510-f6f1ecb9a5eb)
```

**Claude Code CLI (Project-Scoped Key - Recommended):**

```bash
claude mcp add \
  --transport stdio \
  cocalc \
  --env COCALC_API_KEY="sk-your-project-api-key-here" \
  -- uv --directory /path/to/cocalc-api run cocalc-mcp-server
```

**Claude Code CLI (Account-Scoped Key):**

```bash
claude mcp add \
  --transport stdio \
  cocalc \
  --env COCALC_API_KEY="sk-your-account-api-key-here" \
  -- uv --directory /path/to/cocalc-api run cocalc-mcp-server
```

**Claude Desktop (Project-Scoped Key - Recommended):**

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cocalc": {
      "command": "uv",
      "args": [
        "--directory",
        "/path/to/cocalc-api",
        "run",
        "cocalc-mcp-server"
      ],
      "env": {
        "COCALC_API_KEY": "sk-your-project-api-key-here"
      }
    }
  }
}
```

**Claude Desktop (Account-Scoped Key):**

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cocalc": {
      "command": "uv",
      "args": [
        "--directory",
        "/path/to/cocalc-api",
        "run",
        "cocalc-mcp-server"
      ],
      "env": {
        "COCALC_API_KEY": "sk-your-account-api-key-here"
      }
    }
  }
}
```

## Server Metadata

The MCP server exposes high-level metadata that clients can query to understand what the server provides:

**Server Instructions** - A comprehensive guide to the server's capabilities, usage, and examples. Sent to LLMs to provide context about what tools and resources are available.

**Website URL** - Link to documentation (https://cocalc.com/api/python)

**Protocol Version** - MCP 2025-06-18

Clients can retrieve this metadata using the MCP `initialize` call, which returns:
- `serverInfo.name` - "cocalc-api"
- `serverInfo.version` - Version from package metadata
- `instructions` - High-level guide (see above)
- `capabilities` - What features the server supports (tools, resources, etc.)

This allows LLM clients to understand the server's purpose and capabilities before making any requests.

## Architecture

### Module Structure

```
src/cocalc_api/mcp/
├── server.py          # Entry point, imports mcp_server
├── mcp_server.py      # Central coordination hub
├── tools/
│   ├── __init__.py    # register_tools(mcp)
│   └── exec.py        # register_exec_tool(mcp)
└── resources/
    ├── __init__.py    # register_resources(mcp)
    └── file_listing.py # register_file_listing_resource(mcp)
```

### Initialization Flow

1. **`server.py`** imports `mcp_server` module
2. **`mcp_server.py`** initializes at import time:
   - Creates `FastMCP("cocalc-api")` instance with:
     - `instructions` - High-level guide for LLM clients
     - `website_url` - Link to documentation
   - Initializes `Project` client (lazy, cached)
   - Calls `tools.register_tools(mcp)`
   - Calls `resources.register_resources(mcp)`
3. **`tools/` and `resources/`** register their handlers with the shared `mcp` object
4. **`server.py`** calls `mcp.run(transport="stdio")`
5. When clients connect, the server responds to `initialize` with metadata including instructions

### Key Design Decisions

- **Single Project Client**: Initialized once, shared across all tools/resources
- **FastMCP Framework**: Automatic JSON-RPC handling, clean decorator pattern
- **No Wrapper Functions**: Tools/resources decorated directly in their modules
- **Dependency Injection**: mcp object passed to registration functions
- **Easy Extension**: Add new tool by creating `tools/my_tool.py` with `register_my_tool(mcp)` function

## Available Tools & Resources

### Tools

#### `exec` - Execute Shell Commands

Execute arbitrary shell commands in the CoCalc project.

**Parameters:**

- `command` (string, required): Command to execute
- `args` (list, optional): Command arguments
- `bash` (boolean, optional): Interpret as bash script
- `timeout` (integer, optional): Timeout in seconds
- `cwd` (string, optional): Working directory

**Returns:** stdout, stderr, and exit_code

**Examples:**

```json
{"command": "echo 'Hello'"}
{"command": "python", "args": ["script.py", "--verbose"]}
{"command": "for i in {1..3}; do echo $i; done", "bash": true}
```

### Resources

#### `project-files` - List Files

Browse project directory structure.

**URI:** `cocalc://project-files/{path}`

**Parameters:**

- `path` (string, optional): Directory path (default: `.`)

**Returns:** Formatted list of files and directories

## Development Workflow

### Adding a New Tool

1. Create `tools/my_tool.py`:

```python
def register_my_tool(mcp) -> None:
    """Register my tool with FastMCP instance."""
    @mcp.tool()
    async def my_tool(param: str) -> str:
        """Tool description."""
        from ..mcp_server import get_project_client
        project = get_project_client()
        # Implementation using project client
        return result
```

2. Update `tools/__init__.py`:

```python
def register_tools(mcp) -> None:
    from .exec import register_exec_tool
    from .my_tool import register_my_tool  # Add this

    register_exec_tool(mcp)
    register_my_tool(mcp)  # Add this
```

3. Done! The tool is automatically registered when `mcp_server` imports tools.

### Testing

```bash
# Run MCP server in one terminal
make mcp

# Test with another terminal (example)
python3 << 'EOF'
import json, subprocess
proc = subprocess.Popen(['uv', 'run', 'cocalc-mcp-server'], ...)
init = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {...}}
proc.stdin.write(json.dumps(init) + '\n')
# ... test tool calls
EOF
```

## Error Handling

- Configuration errors → Exit with error message
- Project authentication errors → Connection failure
- Tool runtime errors → Returned as error in response

## Security Notes

1. **API Keys** - Never commit to version control; use environment variables
2. **Project Isolation** - Each server instance is bound to one project
3. **Command Execution** - `exec` tool runs arbitrary commands; verify API key permissions
4. **File Access** - File listing respects project filesystem permissions

## Future Enhancements

- File read/write operations
- Jupyter code execution
- Git repository operations
- Directory caching and recursion
- Rate limiting

## References

- **MCP Spec**: https://modelcontextprotocol.io/
- **FastMCP Docs**: https://github.com/modelcontextprotocol/python-sdk
- **CoCalc API**: See parent directory README
