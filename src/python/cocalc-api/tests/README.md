# CoCalc API Tests

This directory contains pytest tests for the cocalc-api Python package.

## Prerequisites

1. **Required**: Set the `COCALC_API_KEY` environment variable with a valid CoCalc API key (tests will fail if not set)
2. **Recommended**: Set `PGHOST` for database cleanup (see [Automatic Cleanup](#automatic-cleanup) below)
3. Optionally set `COCALC_HOST` to specify the CoCalc server URL (defaults to `http://localhost:5000`)

## Running Tests

```bash
# Run all tests
make test

# Run tests with verbose output
make test-verbose

# Or use pytest directly
uv run pytest
uv run pytest -v

# Run specific test files
uv run pytest tests/test_hub.py -v
uv run pytest tests/test_jupyter.py -v
```

## Test Structure

- `conftest.py` - Pytest configuration and fixtures (includes resource tracking and cleanup)
- `test_hub.py` - Tests for Hub client functionality (projects, database queries, messages)
- `test_project.py` - Tests for Project client functionality (ping, exec commands)
- `test_jupyter.py` - Tests for Jupyter kernel installation and code execution
- `test_org.py` - Tests for organization management (create, users, licenses)
- `test_org_basic.py` - Basic organization API tests

## Environment Variables

### Required

- `COCALC_API_KEY` - Your CoCalc API key

### Optional

- `COCALC_HOST` - CoCalc server URL (default: `http://localhost:5000`)
- `COCALC_TESTS_CLEANUP` - Enable/disable automatic cleanup (default: `true`)

### For Database Cleanup (Recommended)

- `PGHOST` - PostgreSQL host (socket path or hostname)
- `PGUSER` - PostgreSQL user (default: `smc`)
- `PGDATABASE` - PostgreSQL database (default: `smc`)
- `PGPORT` - PostgreSQL port for network connections (default: `5432`)
- `PGPASSWORD` - PostgreSQL password (only needed for network connections)

## Resource Tracking and Cleanup

### Tracked Resource System

The test suite uses a **resource tracking system** to automatically manage all created resources. When writing tests, use the provided helper functions to ensure proper cleanup:

```python
def test_my_feature(hub, resource_tracker):
    # Create tracked resources using helper functions
    org_id = create_tracked_org(hub, resource_tracker, "test-org")
    user_id = create_tracked_user(hub, resource_tracker, "test-org", email="test@example.com")
    project_id = create_tracked_project(hub, resource_tracker, title="Test Project")

    # Run your tests...

    # No manual cleanup needed - happens automatically!
```

**Available Helper Functions:**

- `create_tracked_project(hub, resource_tracker, **kwargs)` - Create and track a project
- `create_tracked_user(hub, resource_tracker, org_name, **kwargs)` - Create and track a user account
- `create_tracked_org(hub, resource_tracker, org_name)` - Create and track an organization

All tracked resources are automatically cleaned up at the end of the test session.

### Shared Fixtures

**Session-scoped fixtures** (created once, shared across all tests):

- `temporary_project` - A single test project used by all tests in the session
- `project_client` - A Project client instance connected to the temporary project
- `hub` - A Hub client instance

These fixtures ensure efficient resource usage by reusing the same project across all tests.

### Automatic Cleanup

At the end of each test session, the cleanup system automatically:

1. **Stops** all tracked projects (via API to gracefully shut them down)
2. **Hard-deletes** all tracked resources from the PostgreSQL database in order:
   - Projects (removed first)
   - Accounts (including all owned projects like "My First Project")
   - Organizations (removed last)

#### Cleanup Configuration

**Socket Connection (Local Development - Recommended):**

```bash
export PGHOST=/path/to/cocalc-data/socket
export PGUSER=smc
# No password needed for Unix socket authentication
```

**Network Connection:**

```bash
export PGHOST=localhost
export PGPORT=5432
export PGUSER=smc
export PGPASSWORD=your_password
```

**Disable Cleanup (Not Recommended):**

```bash
export COCALC_TESTS_CLEANUP=false
```

When cleanup is disabled, test resources will remain in the database and must be manually removed.

#### Why Direct Database Cleanup?

The test suite uses **direct PostgreSQL deletion** instead of API calls because:

- API deletion only sets `deleted=true` (soft delete), leaving data in the database
- Tests create many resources (projects, accounts, orgs) that need complete removal
- Direct SQL ensures thorough cleanup including auto-created projects (e.g., "My First Project")
- Prevents database bloat from repeated test runs

The cleanup process is safe and only removes resources that were explicitly tracked during test execution.
