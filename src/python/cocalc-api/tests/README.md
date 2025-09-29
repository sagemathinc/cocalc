# CoCalc API Tests

This directory contains pytest tests for the cocalc-api Python package.

## Prerequisites

1. **Required**: Set the `COCALC_API_KEY` environment variable with a valid CoCalc API key (tests will fail if not set)
2. Optionally set `COCALC_HOST` to specify the CoCalc server URL (defaults to `http://localhost:5000`)

## Running Tests

```bash
# Run all tests
make test

# Run tests with verbose output
make test-verbose

# Or use pytest directly
uv run pytest
uv run pytest -v
```

## Test Structure

- `conftest.py` - Pytest configuration and fixtures (includes temporary project creation)
- `test_hub.py` - Tests for Hub client functionality including project creation
- `test_project.py` - Tests for Project client functionality using auto-created temporary projects

## Test Markers

- `@pytest.mark.integration` - Marks tests that require a live CoCalc server

## Environment Variables

- `COCALC_API_KEY` (required) - Your CoCalc API key
- `COCALC_HOST` (optional) - CoCalc server URL (default: `http://localhost:5000`)

## Automatic Project Lifecycle Management

The test suite automatically manages project lifecycle for testing via the `temporary_project` fixture:

### Project Creation
- Projects are created with unique names like `CoCalc API Test YYYYMMDD-HHMMSS`
- Projects include a description: "Temporary project created by cocalc-api tests"
- Projects are automatically started and tested for readiness before tests run

### Project Cleanup (NEW)
After all tests complete, the test suite now automatically performs cleanup:
- **Stops** the test project to free up resources
- **Attempts deletion** if the delete API becomes available (currently not implemented)
- Provides clear feedback about cleanup actions and any failures
- If deletion is not available, projects remain stopped but can be manually deleted from the CoCalc interface

This ensures test projects don't continue consuming server resources after tests complete.
