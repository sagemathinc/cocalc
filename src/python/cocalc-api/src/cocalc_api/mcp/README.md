# CoCalc API MCP Server

A Model Context Protocol (MCP) server that provides LLMs (Claude, etc.) with direct access to CoCalc accounts and projects.

## Quick Start

### 1. Set Environment Variables

```bash
export COCALC_API_KEY="sk-your-api-key"  # Account or project-scoped
export COCALC_HOST="http://localhost:5000"  # Optional, defaults to https://cocalc.com
# Optional: only used with account-scoped keys to target a specific project
# export COCALC_PROJECT_ID="your-project-uuid"
```

### 2. Run the Server

```bash
uv run cocalc-mcp-server
```

The server will detect your API key type and automatically register the appropriate tools/resources.
If you supply `COCALC_PROJECT_ID` with an account-scoped key, the MCP server will also prepare a project client for that project. For project-scoped keys, `COCALC_PROJECT_ID` is ignored because the project is embedded in the key.

## Setup with Claude Code

### Quick Registration

```bash
claude mcp add \
  --transport stdio \
  cocalc \
  --env COCALC_API_KEY="sk-your-api-key" \
  -- uv --directory /path/to/cocalc-api run cocalc-mcp-server
```

### Via JSON Config

```bash
claude mcp add-json cocalc '{
  "command": "uv",
  "args": ["--directory", "/path/to/cocalc-api", "run", "cocalc-mcp-server"],
  "env": {"COCALC_API_KEY": "sk-your-api-key"}
}'
```

## Setup with Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cocalc": {
      "command": "uv",
      "args": ["--directory", "/path/to/cocalc-api", "run", "cocalc-mcp-server"],
      "env": {"COCALC_API_KEY": "sk-your-api-key"}
    }
  }
}
```

## Allow Tools in Claude Code Settings

Add to `.claude/settings.json`:

```json
{
  "allowedTools": ["mcp__cocalc__*"]
}
```

## Available Tools & Resources

The server automatically provides different tools based on your API key type:

### Account-Scoped API Keys

**Tools:**
- `projects_search(query="")` - Search and list your projects with collaborator info

**Resources:**
- `cocalc://account-profile` - View your account info, settings, and preferences

### Project-Scoped API Keys

**Tools:**
- `exec(command)` - Execute shell commands in the project
- `jupyter_execute(input, kernel="python3")` - Run code using Jupyter kernels

**Resources:**
- `cocalc://project-files` - Browse the project directory structure

## API Keys

Create API keys at:
- **Account-scoped**: CoCalc Settings → API keys → Create API key
- **Project-scoped**: Project Settings → API keys → Create API key

## Security

- Never commit API keys to version control
- Use restricted file permissions (600) on config files with API keys
- Each server instance is isolated to its scope (account or project)
- Commands execute with the permissions of your API key

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for architecture, design patterns, and adding new tools.

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [CoCalc API Documentation](https://github.com/sagemathinc/cocalc)
