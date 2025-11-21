# CoCalc Python API Client

[![PyPI version](https://badge.fury.io/py/cocalc-api.svg)](https://pypi.org/project/cocalc-api/)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)

This is a Python package that provides an API client for [CoCalc](https://cocalc.com), enabling programmatic access to CoCalc's features including project management, Jupyter execution, file operations, messaging, and organization management.

## Installation

```bash
pip install cocalc-api
```

## Quick Start

```python
import cocalc_api

# Initialize hub client with your API key
hub = cocalc_api.Hub(api_key="your-api-key")

# Ping the server
response = hub.system.ping()
print(f"Server time: {response['now']}")

# List your projects
projects = hub.projects.get()
for project in projects:
    print(f"Project: {project['title']} ({project['project_id']})")
```

## Features

### Hub Client (Account-Level Operations)

The `Hub` class provides access to account-level operations:

- **System**: Server ping, user search, account name resolution
- **Projects**: Project management (create, start, stop, add/remove collaborators)
- **Jupyter**: Execute code using Jupyter kernels in any project or anonymously
- **Database**: Direct PostgreSQL database queries for advanced operations
- **Messages**: Send and receive messages between users
- **Organizations**: Manage organizations, users, and temporary access tokens
- **Sync**: Access file edit history and synchronization features

### Project Client (Project-Specific Operations)

The `Project` class provides project-specific operations:

- **System**: Execute shell commands and Jupyter code within a specific project

## MCP Server

The CoCalc API includes a **Model Context Protocol (MCP) server** that allows LLMs (like Claude) to interact with CoCalc projects through a standardized protocol.

For detailed setup instructions and usage guide, see [src/cocalc_api/mcp/README.md](src/cocalc_api/mcp/README.md).

## Authentication

The client supports two types of API keys:

1. **Account API Keys**: Provide full access to all hub functionality
2. **Project API Keys**: Limited to project-specific operations

Get your API key from [CoCalc Account Settings](https://cocalc.com/settings/account) under "API Keys".

## Architecture

### Package Structure

```
src/cocalc_api/
├── __init__.py          # Package exports (Hub, Project classes)
├── hub.py              # Hub client for account-level operations
├── project.py          # Project client for project-specific operations
├── api_types.py        # TypedDict definitions for API responses
└── util.py             # Utility functions and decorators
```

### Design Patterns

- **Decorator-based Methods**: Uses `@api_method()` decorator to automatically convert method calls to API requests
- **TypedDict Responses**: All API responses use TypedDict for type safety
- **Error Handling**: Centralized error handling via `handle_error()` utility
- **HTTP Client**: Uses `httpx` for HTTP requests with authentication
- **Nested Namespaces**: API organized into logical namespaces (system, projects, jupyter, etc.)

## Development

### Requirements

- Python 3.9+
- [uv](https://github.com/astral-sh/uv) package manager

### Setup

```bash
# Install dependencies
make install
# or: uv sync --dev && uv pip install -e .

# Format Python code
make format
# or: uv run yapf --in-place --recursive src/

# Run code quality checks
make check
# or: uv run ruff check src/ && uv run mypy src/ && uv run pyright src/

# Serve documentation locally
make serve-docs
# or: uv run mkdocs serve

# Build documentation
make build-docs
```

### Code Quality

This project uses multiple tools for code quality:

- **[YAPF](https://github.com/google/yapf)**: Python code formatter
- **[Ruff](https://docs.astral.sh/ruff/)**: Fast Python linter
- **[MyPy](http://mypy-lang.org/)**: Static type checking
- **[Pyright](https://github.com/microsoft/pyright)**: Additional static type checking
- **[MkDocs](https://www.mkdocs.org/)**: Documentation generation

### Documentation Standards

All docstrings follow the [Google Style Guide](https://google.github.io/styleguide/pyguide.html#38-comments-and-docstrings) for Python docstrings. This includes:

- Clear one-line summary
- Detailed description when needed
- Properly formatted `Args:`, `Returns:`, `Raises:`, and `Examples:` sections
- Type information consistent with function signatures
- Consistent capitalization and punctuation

Example:
```python
def example_function(param1: str, param2: Optional[int] = None) -> dict[str, Any]:
    """
    Brief description of the function.

    Longer description if needed, explaining the function's behavior,
    side effects, or important usage notes.

    Args:
        param1 (str): Description of the first parameter.
        param2 (Optional[int]): Description of the optional parameter.

    Returns:
        dict[str, Any]: Description of the return value.

    Raises:
        ValueError: When this exception might be raised.

    Examples:
        >>> result = example_function("hello", 42)
        >>> print(result)
        {'status': 'success', 'data': 'hello'}
    """
```

## License

MIT License. See the [LICENSE](LICENSE) file for details.

## Links

- [PyPI Package](https://pypi.org/project/cocalc-api/)
- [CoCalc Website](https://cocalc.com)
- [Documentation](https://cocalc.com/api/python)
- [Source Code](https://github.com/sagemathinc/cocalc/tree/master/src/python/cocalc-api)
- [Issue Tracker](https://github.com/sagemathinc/cocalc/issues)
