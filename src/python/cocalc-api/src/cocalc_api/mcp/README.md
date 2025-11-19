# CoCalc API MCP Server

A Model Context Protocol (MCP) server that allows LLMs to interact with CoCalc projects.

## Quick Start

### 1. Configuration

Set environment variables:

```bash
export COCALC_API_KEY="sk-your-api-key"
export COCALC_PROJECT_ID="your-project-uuid"
export COCALC_HOST="https://cocalc.com"  # optional, defaults to https://cocalc.com
```

### 2. Run the Server

```bash
uv run cocalc-mcp-server
```

### 3. Setup with Claude Code CLI

```bash
# Set your credentials
export COCALC_API_KEY="sk-your-api-key-here"
export COCALC_PROJECT_ID="[UUID]"
export COCALC_API_PATH="/path/to/cocalc/src/python/cocalc-api"
# OPTIONAL: set the host, defaults to cocalc.com. for development use localhost:5000
export COCALC_HOST="http://localhost:5000"

# Add the MCP server to Claude Code
claude mcp add \
  --transport stdio \
  cocalc \
  --env COCALC_API_KEY="$COCALC_API_KEY" \
  --env COCALC_PROJECT_ID="$COCALC_PROJECT_ID" \
  --env COCALC_HOST="$COCALC_HOST" \
  -- uv --directory "$COCALC_API_PATH" run cocalc-mcp-server
```

Alternatively, using JSON configuration:

```bash
claude mcp add-json cocalc '{
  "command": "uv",
  "args": ["--directory", "/path/to/cocalc/src/python/cocalc-api", "run", "cocalc-mcp-server"],
  "env": {
    "COCALC_API_KEY": "sk-your-api-key-here",
    "COCALC_PROJECT_ID": "[UUID]",
    "COCALC_HOST": "http://localhost:5000"
  }
}'
```

**Important:**

- Replace `/path/to/cocalc/src/python/cocalc-api` with the absolute path to your cocalc-api directory.
- Replace `http://localhost:5000` with your CoCalc instance URL (defaults to `https://cocalc.com` if not set).

### 4. Setup with Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cocalc": {
      "command": "uv",
      "args": [
        "--directory",
        "/path/to/cocalc/src/python/cocalc-api",
        "run",
        "cocalc-mcp-server"
      ],
      "env": {
        "COCALC_API_KEY": "sk-your-api-key-here",
        "COCALC_PROJECT_ID": "[UUID]",
        "COCALC_HOST": "http://localhost:5000"
      }
    }
  }
}
```

**Important:**

- Replace `/path/to/cocalc/src/python/cocalc-api` with the absolute path to your cocalc-api directory.
- Replace `http://localhost:5000` with your CoCalc instance URL (defaults to `https://cocalc.com` if not set).

### 5. Allow MCP Tools in Claude Code Settings

To automatically allow all CoCalc MCP tools without prompts, add this to `.claude/settings.json`:

```json
{
  "allowedTools": ["mcp__cocalc__*"]
}
```

This wildcard pattern (`mcp__cocalc__*`) automatically allows:

- `mcp__cocalc__exec` - Execute shell commands
- `mcp__cocalc__project_files` - Browse project files
- Any future tools added to the MCP server

## Features

### Tools

- **`exec`** - Execute shell commands in the project

  ```
  Tool: exec
  Params: command (required), args, bash, timeout, cwd
  Returns: {stdout, stderr, exit_code}
  ```

- **`jupyter_execute`** - Execute code using Jupyter kernels
  ```
  Tool: jupyter_execute
  Params: input (required), kernel (default: "python3"), history
  Returns: Formatted execution output (text, plots, errors, etc.)
  ```

### Resources

- **`project-files`** - Browse project files with filtering and pagination
  ```
  URI: cocalc://project-files/{path}?glob=*.py&limit=100&recurse=true
  Returns: File listing with metadata
  ```

## Documentation

See [DEVELOPMENT.md](./DEVELOPMENT.md) for:

- Architecture and design principles
- Detailed API specifications
- Configuration options
- Testing strategy
- Future roadmap

## Directory Structure

```
src/cocalc_api/mcp/
├── README.md                 # This file
├── DEVELOPMENT.md            # Architecture & design documentation
├── server.py                 # Main MCP server
├── mcp_server.py            # MCP instance and project client coordination
├── __main__.py              # Module entry point
├── tools/
│   ├── exec.py              # Shell command execution tool
│   └── __init__.py
└── resources/
    ├── file_listing.py      # File listing resource
    └── __init__.py
```

## Requirements

- Python 3.10+
- mcp>=1.0
- httpx
- pydantic (via mcp)

## Security

- API keys should never be committed to version control
- Use restricted file permissions (600) on config files containing API keys
- Each server instance is scoped to a single project
- Commands execute with the permissions of the CoCalc project user

## Next Steps

See [DEVELOPMENT.md](./DEVELOPMENT.md#next-steps) for implementation roadmap and upcoming features.
