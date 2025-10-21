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

### 3. Use with Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cocalc": {
      "command": "uv",
      "args": ["run", "cocalc-mcp-server"],
      "env": {
        "COCALC_API_KEY": "sk-your-api-key",
        "COCALC_PROJECT_ID": "your-project-uuid",
        "COCALC_HOST": "https://cocalc.com"
      }
    }
  }
}
```

Then restart Claude Desktop and you'll have access to the CoCalc tools.

## Features

### Tools

- **`exec`** - Execute shell commands in the project
  ```
  Tool: exec
  Params: command (required), args, bash, timeout, cwd
  Returns: {stdout, stderr, exit_code}
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
├── __main__.py              # Module entry point
├── tools/
│   ├── exec.py              # Shell command execution tool
│   └── __init__.py
└── resources/
    ├── project_files.py     # File listing resource
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
