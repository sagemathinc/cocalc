"""
Pytest configuration and fixtures for cocalc-api tests.
"""
import os
import pytest

from cocalc_api import Hub, Project


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
def temporary_project(hub):
    """
    Create a temporary project for testing and return project info.

    Note: Since there's no project deletion API available, the project
    will remain after tests. It can be manually deleted if needed.
    """
    import time

    # Create a project with a timestamp to make it unique and identifiable
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    title = f"CoCalc API Test {timestamp}"
    description = "Temporary project created by cocalc-api tests"

    project_id = hub.projects.create_project(title=title, description=description)

    # Start the project so it can respond to API calls
    try:
        hub.projects.start(project_id)
        print(f"Started project {project_id}, waiting for it to become ready...")

        # Wait for project to be ready (can take 10-15 seconds)
        import time
        from cocalc_api import Project

        for attempt in range(10):
            time.sleep(5)  # Wait 5 seconds before checking
            try:
                # Try to ping the project to see if it's ready
                test_project = Project(project_id=project_id, api_key=hub.api_key, host=hub.host)
                test_project.system.ping()  # If this succeeds, project is ready
                print(f"✓ Project {project_id} is ready after {(attempt + 1) * 5} seconds")
                break
            except Exception:
                if attempt == 9:  # Last attempt
                    print(f"Warning: Project {project_id} did not become ready within 50 seconds")

    except Exception as e:
        print(f"Warning: Failed to start project {project_id}: {e}")

    project_info = {'project_id': project_id, 'title': title, 'description': description}

    yield project_info

    # Cleanup: Stop the project and attempt to delete it
    print(f"\nCleaning up test project '{title}' (ID: {project_id})...")

    try:
        # Stop the project first
        print(f"  Stopping project {project_id}...")
        hub.projects.stop(project_id)
        print(f"  Project {project_id} stopped successfully")
    except Exception as e:
        print(f"  Failed to stop project {project_id}: {e}")

    try:
        # Delete the project using the new delete method
        print(f"  Deleting project {project_id}...")
        hub.projects.delete(project_id)
        print(f"  Project {project_id} deleted successfully")
    except Exception as e:
        print(f"  Failed to delete project {project_id}: {e}")
        print("  Project is stopped but may still exist - manual cleanup recommended")


@pytest.fixture(scope="session")
def project_client(temporary_project, api_key, cocalc_host):
    """Create Project client instance using temporary project."""
    return Project(project_id=temporary_project['project_id'], api_key=api_key, host=cocalc_host)
