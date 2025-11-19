"""
Pytest configuration and fixtures for cocalc-api tests.
"""
import json
import os
import time
import uuid
import pytest

from cocalc_api import Hub, Project

from psycopg2 import pool as pg_pool
from typing import Callable, TypeVar

# Database configuration examples (DRY principle)
PGHOST_SOCKET_EXAMPLE = "/path/to/cocalc-data/socket"
PGHOST_NETWORK_EXAMPLE = "localhost"

T = TypeVar('T')


def retry_with_backoff(
    func: Callable[[], T],
    max_retries: int = 3,
    retry_delay: int = 5,
    error_condition: Callable[[RuntimeError], bool] = lambda e: any(
        keyword in str(e).lower() for keyword in ["timeout", "closed", "connection", "reset", "broken"]
    ),
) -> T:
    """
    Retry a function call with exponential backoff for timeout and connection errors.

    This helper is useful for operations that may timeout or fail on first attempt due to
    cold starts (e.g., kernel launches) or transient connection issues.

    Args:
        func: Callable that performs the operation
        max_retries: Maximum number of attempts (default: 3)
        retry_delay: Delay in seconds between retries (default: 5)
        error_condition: Function to determine if an error should trigger retry.
                        Defaults to checking for timeout/connection-related keywords.

    Returns:
        The result of the function call

    Raises:
        RuntimeError: If all retries fail or error condition doesn't match
    """
    for attempt in range(max_retries):
        try:
            return func()
        except RuntimeError as e:
            error_msg = str(e).lower()
            is_retryable = error_condition(e)
            if is_retryable and attempt < max_retries - 1:
                print(f"Attempt {attempt + 1} failed ({error_msg[:50]}...), retrying in {retry_delay}s...")
                time.sleep(retry_delay)
            else:
                raise

    # This should never be reached due to the loop, but mypy needs this
    raise RuntimeError("Retry loop exhausted without returning")


def assert_valid_uuid(value, description="value"):
    """
    Assert that the given value is a string and a valid UUID.

    Args:
        value: The value to check
        description: Description of the value for error messages
    """
    assert isinstance(value, str), f"{description} should be a string, got {type(value)}"
    assert len(value) > 0, f"{description} should not be empty"

    try:
        uuid.UUID(value)
    except ValueError:
        pytest.fail(f"{description} should be a valid UUID, got: {value}")


def cleanup_project(hub, project_id):
    """
    Clean up a test project by stopping it and deleting it.

    Args:
        hub: Hub client instance
        project_id: Project ID to cleanup
    """
    try:
        hub.projects.stop(project_id)
    except Exception as e:
        print(f"Warning: Failed to stop project {project_id}: {e}")

    try:
        hub.projects.delete(project_id)
    except Exception as e:
        print(f"Warning: Failed to delete project {project_id}: {e}")


@pytest.fixture(scope="session")
def api_key():
    """Get API key from environment variable."""
    key = os.environ.get("COCALC_API_KEY")
    if not key:
        pytest.fail("COCALC_API_KEY environment variable is required but not set")
    return key


@pytest.fixture(scope="session")
def cocalc_host():
    """Get CoCalc host from environment variable, default to localhost:5000."""
    return os.environ.get("COCALC_HOST", "http://localhost:5000")


@pytest.fixture(scope="session")
def hub(api_key, cocalc_host):
    """Create Hub client instance."""
    return Hub(api_key=api_key, host=cocalc_host)


@pytest.fixture(scope="session")
def temporary_project(hub, resource_tracker, request):
    """
    Create a temporary project for testing and return project info.
    Uses a session-scoped fixture so only ONE project is created for the entire test suite.
    """
    # Create a project with a timestamp to make it unique and identifiable
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    title = f"CoCalc API Test {timestamp}"
    description = "Temporary project created by cocalc-api tests"

    # Use tracked creation
    project_id = create_tracked_project(hub, resource_tracker, title=title, description=description)

    # Start the project so it can respond to API calls
    try:
        hub.projects.start(project_id)

        # Wait for project to be ready (can take 10-15 seconds)
        from cocalc_api import Project

        test_project = Project(project_id=project_id, api_key=hub.api_key, host=hub.host)
        for attempt in range(10):
            time.sleep(5)  # Wait 5 seconds before checking
            try:
                # Try to ping the project to see if it's ready
                test_project.system.ping()  # If this succeeds, project is ready
                break
            except Exception:
                if attempt == 9:  # Last attempt
                    print(f"Warning: Project {project_id} did not become ready within 50 seconds")
        else:
            print(f"Warning: Project {project_id} may not be ready yet")

        ensure_python3_kernel(test_project)

    except Exception as e:
        print(f"Warning: Failed to start project {project_id}: {e}")

    project_info = {'project_id': project_id, 'title': title, 'description': description}

    # Note: No finalizer needed - cleanup happens automatically via cleanup_all_test_resources

    return project_info


@pytest.fixture(scope="session")
def project_client(temporary_project, api_key, cocalc_host):
    """Create Project client instance using temporary project."""
    return Project(project_id=temporary_project['project_id'], api_key=api_key, host=cocalc_host)


@pytest.fixture(autouse=True)
def cleanup_kernels_after_test(request, project_client):
    """
    Clean up excess Jupyter kernels after test classes that use them.

    Kernel accumulation happens because the kernel pool reuses kernels, but under
    heavy test load, old kernels aren't always properly cleaned up by the pool.
    This fixture cleans up accumulated kernels BETWEEN test classes (not between
    individual tests) to avoid interfering with the pool's reuse strategy.

    The fixture only runs for tests in classes that deal with Jupyter kernels
    (TestJupyterExecuteViaHub, TestJupyterExecuteViaProject, TestJupyterKernelManagement)
    to avoid interfering with other tests.
    """
    yield  # Allow test to run

    # Only cleanup for Jupyter-related tests
    test_class = request.cls
    if test_class is None:
        return

    jupyter_test_classes = {
        'TestJupyterExecuteViaHub',
        'TestJupyterExecuteViaProject',
        'TestJupyterKernelManagement',
    }

    if test_class.__name__ not in jupyter_test_classes:
        return

    # Clean up accumulated kernels carefully
    # Only cleanup if we have more kernels than the pool can manage (> 3)
    # This gives some buffer to the pool's reuse mechanism
    try:
        import time
        kernels = project_client.system.list_jupyter_kernels()

        # Only cleanup if significantly over pool size (pool size is 2)
        # We use threshold of 3 to trigger cleanup
        if len(kernels) > 3:
            # Keep the 2 most recent kernels (higher PIDs), stop older ones
            kernels_sorted = sorted(kernels, key=lambda k: k.get("pid", 0))
            kernels_to_stop = kernels_sorted[:-2]  # All but the 2 newest

            for kernel in kernels_to_stop:
                try:
                    project_client.system.stop_jupyter_kernel(pid=kernel["pid"])
                    time.sleep(0.1)  # Small delay between kills
                except Exception:
                    # Silently ignore individual kernel failures
                    pass
    except Exception:
        # If listing kernels fails, just continue
        pass


def ensure_python3_kernel(project_client: Project):
    """
    Ensure the default python3 Jupyter kernel is installed in the project.

    If not available, install ipykernel and register the kernelspec.
    """

    def try_exec(command: list[str], timeout: int = 60, capture_stdout: bool = False):
        try:
            result = project_client.system.exec(
                command=command[0],
                args=command[1:],
                timeout=timeout,
            )
            return (True, result["stdout"] if capture_stdout else None)
        except Exception as err:
            print(f"Warning: command {command} failed: {err}")
            return (False, None)

    def has_python_kernel() -> bool:
        ok, stdout = try_exec(
            ["python3", "-m", "jupyter", "kernelspec", "list", "--json"],
            capture_stdout=True,
        )
        if not ok or stdout is None:
            return False
        try:
            data = json.loads(stdout)
            return "python3" in data.get("kernelspecs", {})
        except Exception as err:
            print(f"Warning: Failed to parse kernelspec list: {err}")
            return False

    if has_python_kernel():
        return

    print("Installing python3 kernelspec in project...")
    # Install pip if needed
    try_exec(["python3", "-m", "ensurepip", "--user"], timeout=120)
    # Upgrade pip but ignore errors (not fatal)
    try_exec(["python3", "-m", "pip", "install", "--user", "--upgrade", "pip"], timeout=120)

    if not try_exec(["python3", "-m", "pip", "install", "--user", "ipykernel"], timeout=300):
        raise RuntimeError("Failed to install ipykernel via pip")

    if not try_exec(
        [
            "python3",
            "-m",
            "ipykernel",
            "install",
            "--user",
            "--name=python3",
            "--display-name=Python 3",
        ],
        timeout=120,
    ):
        raise RuntimeError("Failed to install python3 kernelspec")

    if not has_python_kernel():
        raise RuntimeError("Failed to ensure python3 kernelspec is installed in project")


# ============================================================================
# Database Cleanup Infrastructure
# ============================================================================


@pytest.fixture(scope="session")
def resource_tracker():
    """
    Track all resources created during tests for cleanup.

    This fixture provides a dictionary of sets that automatically tracks
    all projects, accounts, and organizations created during test execution.
    At the end of the test session, all tracked resources are automatically
    hard-deleted from the database.

    Usage:
        def test_my_feature(hub, resource_tracker):
            # Create tracked resources using helper functions
            org_id = create_tracked_org(hub, resource_tracker, "test-org")
            user_id = create_tracked_user(hub, resource_tracker, "test-org", email="test@example.com")
            project_id = create_tracked_project(hub, resource_tracker, title="Test Project")

            # Test logic here...

            # No cleanup needed - happens automatically!

    Returns a dictionary with sets for tracking:
    - projects: set of project_id (UUID strings)
    - accounts: set of account_id (UUID strings)
    - organizations: set of organization names (strings)
    """
    tracker = {
        'projects': set(),
        'accounts': set(),
        'organizations': set(),
    }
    return tracker


@pytest.fixture(scope="session")
def check_cleanup_config():
    """
    Check cleanup configuration BEFORE any tests run.
    Fails fast if cleanup is enabled but database credentials are missing.
    """
    cleanup_enabled = os.environ.get("COCALC_TESTS_CLEANUP", "true").lower() != "false"

    if not cleanup_enabled:
        print("\n⚠ Database cleanup DISABLED via COCALC_TESTS_CLEANUP=false")
        print("   Test resources will remain in the database.")
        return  # Skip checks if cleanup is disabled

    # Cleanup is enabled - verify required configuration
    pghost = os.environ.get("PGHOST")

    # PGHOST is mandatory
    if not pghost:
        pytest.exit("\n" + "=" * 70 + "\n"
                    "ERROR: Database cleanup is enabled but PGHOST is not set!\n\n"
                    "To run tests, you must either:\n"
                    f"  1. Set PGHOST for socket connection (no password needed):\n"
                    f"     export PGHOST={PGHOST_SOCKET_EXAMPLE}\n\n"
                    f"  2. Set PGHOST for network connection (requires PGPASSWORD):\n"
                    f"     export PGHOST={PGHOST_NETWORK_EXAMPLE}\n"
                    "     export PGPASSWORD=your_password\n\n"
                    "  3. Disable cleanup (not recommended):\n"
                    "     export COCALC_TESTS_CLEANUP=false\n"
                    "=" * 70,
                    returncode=1)


@pytest.fixture(scope="session")
def db_pool(check_cleanup_config):
    """
    Create a PostgreSQL connection pool for direct database cleanup.

    Supports both Unix socket and network connections:

    Socket connection (local dev):
        export PGUSER=smc
        export PGHOST=/path/to/cocalc-data/socket
        # No password needed for socket auth

    Network connection:
        export PGUSER=smc
        export PGHOST=localhost
        export PGPORT=5432
        export PGPASSWORD=your_password

    To disable cleanup:
        export COCALC_TESTS_CLEANUP=false
    """
    # Check if cleanup is disabled
    cleanup_enabled = os.environ.get("COCALC_TESTS_CLEANUP", "true").lower() != "false"

    if not cleanup_enabled:
        print("\n⚠ Database cleanup DISABLED via COCALC_TESTS_CLEANUP=false")
        print("   Test resources will remain in the database.")
        yield None
        return

    # Get connection parameters with defaults
    pguser = os.environ.get("PGUSER", "smc")
    pghost = os.environ.get("PGHOST")
    pgport = os.environ.get("PGPORT", "5432")
    pgdatabase = os.environ.get("PGDATABASE", "smc")
    pgpassword = os.environ.get("PGPASSWORD")

    # PGHOST is mandatory (already checked in check_cleanup_config, but double-check)
    if not pghost:
        pytest.fail("\n" + "=" * 70 + "\n"
                    "ERROR: PGHOST environment variable is required for database cleanup!\n"
                    "=" * 70)

    # Determine if using socket or network connection
    is_socket = pghost.startswith("/")

    # Build connection kwargs
    conn_kwargs = {
        "host": pghost,
        "database": pgdatabase,
        "user": pguser,
    }

    # Only add port for network connections
    if not is_socket:
        conn_kwargs["port"] = pgport

    # Only add password if provided
    if pgpassword:
        conn_kwargs["password"] = pgpassword

    try:
        connection_pool = pg_pool.SimpleConnectionPool(1, 5, **conn_kwargs)

        if is_socket:
            print(f"\n✓ Database cleanup enabled (socket): {pguser}@{pghost}/{pgdatabase}")
        else:
            print(f"\n✓ Database cleanup enabled (network): {pguser}@{pghost}:{pgport}/{pgdatabase}")

        yield connection_pool

        connection_pool.closeall()

    except Exception as e:
        conn_type = "socket" if is_socket else "network"
        pytest.fail("\n" + "=" * 70 + "\n"
                    f"ERROR: Failed to connect to database ({conn_type}) for cleanup:\n{e}\n\n"
                    f"Connection details:\n"
                    f"  Host: {pghost}\n"
                    f"  Database: {pgdatabase}\n"
                    f"  User: {pguser}\n" + (f"  Port: {pgport}\n" if not is_socket else "") +
                    "\nTo disable cleanup: export COCALC_TESTS_CLEANUP=false\n"
                    "=" * 70)


def create_tracked_project(hub, resource_tracker, **kwargs):
    """Create a project and register it for cleanup."""
    project_id = hub.projects.create_project(**kwargs)
    resource_tracker['projects'].add(project_id)
    return project_id


def create_tracked_user(hub, resource_tracker, org_name, **kwargs):
    """Create a user and register it for cleanup."""
    user_id = hub.org.create_user(name=org_name, **kwargs)
    resource_tracker['accounts'].add(user_id)
    return user_id


def create_tracked_org(hub, resource_tracker, org_name):
    """Create an organization and register it for cleanup."""
    org_id = hub.org.create(org_name)
    resource_tracker['organizations'].add(org_name)  # Track by name
    return org_id


def hard_delete_projects(db_pool, project_ids):
    """Hard delete projects from database using direct SQL."""
    if not project_ids:
        return

    conn = db_pool.getconn()
    try:
        cursor = conn.cursor()
        for project_id in project_ids:
            try:
                cursor.execute("DELETE FROM projects WHERE project_id = %s", (project_id, ))
                conn.commit()
                print(f"   ✓ Deleted project {project_id}")
            except Exception as e:
                conn.rollback()
                print(f"   ✗ Failed to delete project {project_id}: {e}")
        cursor.close()
    finally:
        db_pool.putconn(conn)


def hard_delete_accounts(db_pool, account_ids):
    """
    Hard delete accounts from database using direct SQL.

    This also finds and deletes ALL projects where the account is the owner,
    including auto-created projects like "My First Project".
    """
    if not account_ids:
        return

    conn = db_pool.getconn()
    try:
        cursor = conn.cursor()
        for account_id in account_ids:
            try:
                # First, find ALL projects where this account is the owner
                # The users JSONB field has structure: {"account_id": {"group": "owner", ...}}
                cursor.execute(
                    """
                    SELECT project_id FROM projects
                    WHERE users ? %s
                    AND users->%s->>'group' = 'owner'
                    """, (account_id, account_id))
                owned_projects = cursor.fetchall()

                # Delete all owned projects (including auto-created ones)
                for (project_id, ) in owned_projects:
                    cursor.execute("DELETE FROM projects WHERE project_id = %s", (project_id, ))
                    print(f"   ✓ Deleted owned project {project_id} for account {account_id}")

                # Remove from organizations (admin_account_ids array and users JSONB)
                cursor.execute(
                    "UPDATE organizations SET admin_account_ids = array_remove(admin_account_ids, %s), users = users - %s WHERE users ? %s",
                    (account_id, account_id, account_id))

                # Remove from remaining project collaborators (users JSONB field)
                cursor.execute("UPDATE projects SET users = users - %s WHERE users ? %s", (account_id, account_id))

                # Delete the account
                cursor.execute("DELETE FROM accounts WHERE account_id = %s", (account_id, ))
                conn.commit()
                print(f"   ✓ Deleted account {account_id}")
            except Exception as e:
                conn.rollback()
                print(f"   ✗ Failed to delete account {account_id}: {e}")
        cursor.close()
    finally:
        db_pool.putconn(conn)


def hard_delete_organizations(db_pool, org_names):
    """Hard delete organizations from database using direct SQL."""
    if not org_names:
        return

    conn = db_pool.getconn()
    try:
        cursor = conn.cursor()
        for org_name in org_names:
            try:
                cursor.execute("DELETE FROM organizations WHERE name = %s", (org_name, ))
                conn.commit()
                print(f"   ✓ Deleted organization {org_name}")
            except Exception as e:
                conn.rollback()
                print(f"   ✗ Failed to delete organization {org_name}: {e}")
        cursor.close()
    finally:
        db_pool.putconn(conn)


@pytest.fixture(scope="session", autouse=True)
def cleanup_all_test_resources(hub, resource_tracker, db_pool, request):
    """
    Automatically clean up all tracked resources at the end of the test session.

    Cleanup is enabled by default. To disable:
        export COCALC_TESTS_CLEANUP=false
    """

    def cleanup():
        # Skip cleanup if db_pool is None (cleanup disabled)
        if db_pool is None:
            print("\n⚠ Skipping database cleanup (COCALC_TESTS_CLEANUP=false)")
            return

        print("\n" + "=" * 70)
        print("CLEANING UP TEST RESOURCES FROM DATABASE")
        print("=" * 70)

        total_projects = len(resource_tracker['projects'])
        total_accounts = len(resource_tracker['accounts'])
        total_orgs = len(resource_tracker['organizations'])

        print("\nResources to clean up:")
        print(f"  - Projects: {total_projects}")
        print(f"  - Accounts: {total_accounts}")
        print(f"  - Organizations: {total_orgs}")

        # First, soft-delete projects via API (stop them gracefully)
        if total_projects > 0:
            print(f"\nStopping {total_projects} projects...")
            for project_id in resource_tracker['projects']:
                try:
                    cleanup_project(hub, project_id)
                except Exception as e:
                    print(f"   Warning: Failed to stop project {project_id}: {e}")

        # Then hard-delete from database in order:
        # 1. Projects (no dependencies)
        if total_projects > 0:
            print(f"\nHard-deleting {total_projects} projects from database...")
            hard_delete_projects(db_pool, resource_tracker['projects'])

        # 2. Accounts (must remove from organizations/projects first)
        if total_accounts > 0:
            print(f"\nHard-deleting {total_accounts} accounts from database...")
            hard_delete_accounts(db_pool, resource_tracker['accounts'])

        # 3. Organizations (no dependencies after accounts removed)
        if total_orgs > 0:
            print(f"\nHard-deleting {total_orgs} organizations from database...")
            hard_delete_organizations(db_pool, resource_tracker['organizations'])

        print("\n✓ Test resource cleanup complete!")
        print("=" * 70)

    request.addfinalizer(cleanup)

    yield


@pytest.fixture(scope="session", autouse=True)
def cleanup_jupyter_kernels_session(project_client):
    """
    Clean up all Jupyter kernels created during the test session.

    This session-scoped fixture ensures that all kernels spawned during testing
    are properly terminated at the end of the test session. This prevents
    orphaned processes from accumulating in the system.

    The fixture runs AFTER all tests complete (via yield), ensuring no
    interference with test execution while still guaranteeing cleanup.
    """
    yield  # Allow all tests to run first

    # After all tests complete, clean up all remaining kernels
    try:
        kernels = project_client.system.list_jupyter_kernels()
        if kernels:
            print(f"\n{'='*70}")
            print(f"CLEANING UP {len(kernels)} JUPYTER KERNELS FROM TEST SESSION")
            print(f"{'='*70}")
            for kernel in kernels:
                try:
                    pid = kernel.get("pid")
                    result = project_client.system.stop_jupyter_kernel(pid=pid)
                    if result.get("success"):
                        print(f"✓ Stopped kernel PID {pid}")
                    else:
                        print(f"✗ Failed to stop kernel PID {pid}")
                except Exception as e:
                    print(f"✗ Error stopping kernel: {e}")
            print(f"{'='*70}\n")
    except Exception as e:
        print(f"Warning: Failed to clean up jupyter kernels: {e}")
