# CoCalc API MCP Server - Development Guide

## Overview

This directory contains the **Model Context Protocol (MCP) server** implementation for the CoCalc API. The MCP server allows LLMs (via clients like Claude Desktop) to interact with CoCalc projects through a standardized protocol.

Learn more about MCP: https://modelcontextprotocol.io/docs/getting-started/intro

## Architecture

### Design Principles

1. **Single Project Scope**: Each MCP server instance is tied to a specific CoCalc project via `project_id`. This eliminates the need to repeatedly specify which project an operation should run in.

2. **Configuration via Environment & Config**: Parameters are configured through:
   - Environment variables (for local development)
   - MCP server configuration files (for LLM clients like Claude Desktop)

3. **Minimal but Powerful**: Start with essential tools and resources; expand incrementally.

4. **Type-Safe**: Leverage Python type hints and MCP's type system for robust integration.

### Required Configuration

#### Parameters

- **`COCALC_API_KEY`** (required)
  - The API key for authenticating with CoCalc
  - Source: Environment variable or MCP config (environment field)
  - Example: `sk-...`

- **`project_id`** (required)
  - UUID of the target CoCalc project
  - Source: Environment variable or MCP config (environment field)
  - Format: UUID string (e.g., `6e75dbf1-0342-4249-9dce-6b21648656e9`)

- **`COCALC_HOST`** (optional)
  - Base URL for the CoCalc instance
  - Default: `https://cocalc.com`
  - Source: Environment variable or MCP config

#### Example Local Usage

```bash
export COCALC_API_KEY="sk-your-api-key-here"
export COCALC_PROJECT_ID="6e75dbf1-0342-4249-9dce-6b21648656e9"
export COCALC_HOST="https://cocalc.com"  # Optional

uv run cocalc-mcp-server
```

#### Example Claude Desktop Config

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cocalc": {
      "command": "uv",
      "args": ["run", "cocalc-mcp-server"],
      "env": {
        "COCALC_API_KEY": "sk-your-api-key-here",
        "COCALC_PROJECT_ID": "6e75dbf1-0342-4249-9dce-6b21648656e9",
        "COCALC_HOST": "https://cocalc.com"
      }
    }
  }
}
```

## Features

### Phase 1: MVP (Current Development)

#### Tools

##### 1. `exec` - Execute Shell Commands

Execute arbitrary shell commands in the target CoCalc project.

**Purpose**: Run any command line operation in the project's Linux environment.

**Parameters**:
- `command` (string, required): Command to execute (e.g., `date -Ins`, `python script.py`)
- `args` (array of strings, optional): Arguments to pass to the command
- `bash` (boolean, optional): If true, interpret command as bash script
- `timeout` (integer, optional): Timeout in seconds
- `cwd` (string, optional): Working directory (relative to home or absolute)

**Returns**: Object with:
- `stdout` (string): Command output
- `stderr` (string): Error output
- `exit_code` (integer): Process exit code

**Examples**:
```json
// Get current date
{
  "tool": "exec",
  "command": "date -Ins"
}

// Run Python script with arguments
{
  "tool": "exec",
  "command": "python",
  "args": ["script.py", "--verbose", "input.txt"]
}

// Execute a bash script
{
  "tool": "exec",
  "command": "for i in {1..5}; do echo \"Iteration $i\"; done",
  "bash": true
}

// Run with timeout
{
  "tool": "exec",
  "command": "sleep 100",
  "timeout": 5
}
```

#### Resources

##### 1. `project-files` - File Listing & Browsing

Browse and list files in the project directory structure with filtering and pagination.

**Purpose**: Allow the LLM to understand the project's file structure without running commands.

**URI Scheme**: `cocalc://project-files/{path}`

**Query Parameters**:
- `path` (string): Directory path to list (relative to home, default: `.`)
- `glob` (string, optional): Glob pattern to filter files (e.g., `*.py`, `**/*.txt`)
- `limit` (integer, optional): Maximum number of files to return (default: 100, max: 1000)
- `recurse` (boolean, optional): Recursively list subdirectories (default: false)

**Returns**: Array of file objects with:
- `name` (string): Filename
- `path` (string): Full path relative to home
- `type` (string): `file` or `directory`
- `size` (integer): File size in bytes (0 for directories)
- `modified` (string): Last modified timestamp (ISO 8601)

**Examples**:

```uri
// List current directory
cocalc://project-files/

// List Python files with recursion
cocalc://project-files/?glob=*.py&recurse=true

// List all markdown files, limited to 50 results
cocalc://project-files/?glob=*.md&limit=50

// Browse a subdirectory
cocalc://project-files/notebooks?limit=20
```

**Return Example**:
```json
{
  "uri": "cocalc://project-files/",
  "contents": [
    {
      "name": "script.py",
      "path": "script.py",
      "type": "file",
      "size": 2048,
      "modified": "2025-10-21T14:30:00Z"
    },
    {
      "name": "data",
      "path": "data",
      "type": "directory",
      "size": 0,
      "modified": "2025-10-21T14:25:00Z"
    }
  ]
}
```

## Implementation Structure

```
src/cocalc_api/mcp/
├── DEVELOPMENT.md          # This file
├── __init__.py             # Package initialization
├── server.py               # Main MCP server entry point
├── tools/
│   ├── __init__.py
│   ├── exec.py            # Shell execution tool
│   └── base.py            # Base tool class (if needed)
└── resources/
    ├── __init__.py
    ├── project_files.py   # File listing resource
    └── base.py            # Base resource class (if needed)
```

### File Responsibilities

- **`server.py`**: Initializes MCP server, registers tools/resources, handles configuration
- **`tools/exec.py`**: Implementation of the `exec` tool
- **`resources/project_files.py`**: Implementation of file listing resource

## Configuration & Initialization

### Server Initialization Flow

1. **Read Configuration**:
   - Check environment variables: `COCALC_API_KEY`, `COCALC_PROJECT_ID`, `COCALC_HOST`
   - Validate all required parameters are set
   - Initialize HTTP client with auth

2. **Create Project Client**:
   - Instantiate `Project(api_key, project_id, host)`
   - Verify project is accessible (ping test)

3. **Register Tools**:
   - `exec`: Shell command execution

4. **Register Resources**:
   - `project-files`: File listing

5. **Start Server**:
   - Begin listening for MCP requests

### Error Handling

- Configuration errors → Exit with clear error message
- Project authentication errors → Cannot access project
- Runtime errors in tools → Return error in MCP format
- Network errors → Retry logic with exponential backoff (future enhancement)

## Testing Strategy

### Unit Tests

- **`test_exec.py`**: Test command execution with various inputs
- **`test_project_files.py`**: Test file listing and filtering
- **`test_server.py`**: Test server initialization and configuration

### Integration Tests

- Full flow: Initialize server → Execute command → List files
- Error cases: Invalid project_id, auth failures, malformed requests
- Performance: Large directory listings, recursive traversal

### Manual Testing

```bash
# Start the MCP server locally
export COCALC_API_KEY="sk-..."
export COCALC_PROJECT_ID="..."
python -m cocalc_api.mcp.server

# In another terminal, test with a client (future)
```

## Future Enhancements

### Phase 2: File Operations

- **`file-read`** resource: Read file contents
- **`file-write`** tool: Write/create files
- **`file-delete`** tool: Delete files
- **`file-rename`** tool: Rename/move files

### Phase 3: Advanced Features

- **`jupyter-execute`** tool: Run Jupyter code
- **`git-status`** resource: Git repository status
- **`project-info`** resource: Project metadata and state
- **Caching**: Cache directory listings and file metadata

### Phase 4: Optimization

- Connection pooling for multiple concurrent requests
- Request queuing to prevent project overload
- Streaming responses for large file operations
- Metrics collection and logging

## Dependencies

- **`mcp>=1.0`**: Model Context Protocol SDK
- **`httpx`**: HTTP client (already in project)
- **`pydantic>=2.0`**: Data validation (via mcp dependency)
- **`python-dotenv`**: Environment variable loading (via mcp dependency)

## Development Commands

```bash
# Install development dependencies
uv pip install -e ".[dev]"

# Run tests
pytest tests/test_mcp_*.py -v

# Run with debugging
export COCALC_API_KEY="sk-..."
export COCALC_PROJECT_ID="..."
python -m cocalc_api.mcp.server

# Type checking
mypy src/cocalc_api/mcp/

# Code formatting
ruff format src/cocalc_api/mcp/
```

## References

- **MCP Specification**: https://modelcontextprotocol.io/
- **MCP Python SDK**: https://github.com/modelcontextprotocol/python-sdk
- **CoCalc API**: See parent directory documentation
- **Claude Desktop Config**: https://modelcontextprotocol.io/docs/tools/resources

## Security Considerations

1. **API Key Security**: Never commit API keys to version control. Use environment variables or secure config files with restricted permissions (600).

2. **Project Isolation**: Each server instance targets only one project. Different projects require different MCP server instances.

3. **Command Execution**: The `exec` tool runs arbitrary commands in the project. Ensure the API key has appropriate permissions.

4. **File Access**: File listing respects project filesystem permissions. Only files accessible to the project user are listed.

5. **Rate Limiting**: Consider implementing rate limiting in production to prevent overload (future enhancement).

## Next Steps

1. Implement `server.py` with MCP server initialization
2. Implement `tools/exec.py` with shell command execution
3. Implement `resources/project_files.py` with file listing
4. Add comprehensive error handling and validation
5. Write tests for all components
6. Document usage examples in README
7. Test with actual LLM clients (Claude, etc.)
