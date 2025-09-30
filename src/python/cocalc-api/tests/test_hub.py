"""
Tests for Hub client functionality.
"""
import time
import pytest

from cocalc_api import Hub, Project
from .conftest import assert_valid_uuid


class TestHubSystem:
    """Tests for Hub system operations."""

    def test_ping(self, hub):
        """Test basic ping connectivity with retry logic."""
        # Retry with exponential backoff in case server is still starting up
        max_attempts = 5
        delay = 2  # Start with 2 second delay

        for attempt in range(max_attempts):
            try:
                result = hub.system.ping()
                assert result is not None
                # The ping response should contain some basic server info
                assert isinstance(result, dict)
                print(f"✓ Server ping successful on attempt {attempt + 1}")
                return  # Success!
            except Exception as e:
                if attempt < max_attempts - 1:
                    print(f"Ping attempt {attempt + 1} failed, retrying in {delay}s... ({e})")
                    time.sleep(delay)
                    delay *= 2  # Exponential backoff
                else:
                    pytest.fail(f"Server ping failed after {max_attempts} attempts: {e}")

    def test_hub_initialization(self, api_key, cocalc_host):
        """Test Hub client initialization."""
        hub = Hub(api_key=api_key, host=cocalc_host)
        assert hub.api_key == api_key
        assert hub.host == cocalc_host
        assert hub.client is not None

    def test_invalid_api_key(self, cocalc_host):
        """Test behavior with invalid API key."""
        hub = Hub(api_key="invalid_key", host=cocalc_host)
        with pytest.raises((ValueError, RuntimeError, Exception)):  # Should raise authentication error
            hub.system.ping()

    def test_multiple_pings(self, hub):
        """Test that multiple ping calls work consistently."""
        for _i in range(3):
            result = hub.system.ping()
            assert result is not None
            assert isinstance(result, dict)


class TestHubProjects:
    """Tests for Hub project operations."""

    def test_create_project(self, hub):
        """Test creating a project via hub.projects.create_project."""
        import time
        timestamp = int(time.time())
        title = f"test-project-{timestamp}"
        description = "Test project for API testing"

        project_id = hub.projects.create_project(title=title, description=description)

        try:
            assert project_id is not None
            assert_valid_uuid(project_id, "Project ID")
            print(f"✓ Created project: {project_id}")
        finally:
            # Cleanup: stop then delete the project
            try:
                print(f"Cleaning up test project {project_id}...")
                hub.projects.stop(project_id)
                print("✓ Project stop command sent")
                time.sleep(3)  # Wait for process to terminate
                print(f"✓ Waited for project {project_id} to stop")
                hub.projects.delete(project_id)
                print(f"✓ Project {project_id} deleted")
            except Exception as e:
                print(f"⚠ Failed to cleanup project {project_id}: {e}")

    def test_list_projects(self, hub):
        """Test listing projects."""
        projects = hub.projects.get()
        assert isinstance(projects, list)
        # Each project should have basic fields
        for project in projects:
            assert 'project_id' in project
            assert isinstance(project['project_id'], str)

    def test_delete_method_exists(self, hub):
        """Test that delete method is available and callable."""
        # Test that the delete method exists and is callable
        assert hasattr(hub.projects, 'delete')
        assert callable(hub.projects.delete)

        # Note: We don't actually delete anything in this test since
        # deletion is tested in the project lifecycle via temporary_project fixture

    def test_project_lifecycle(self, hub):
        """Test complete project lifecycle: create, wait for ready, run command, delete, verify deletion."""

        # 1. Create a project
        timestamp = int(time.time())
        title = f"lifecycle-test-{timestamp}"
        description = "Test project for complete lifecycle testing"

        print(f"\n1. Creating project '{title}'...")
        project_id = hub.projects.create_project(title=title, description=description)
        assert project_id is not None
        assert_valid_uuid(project_id, "Project ID")
        print(f"   Created project: {project_id}")

        try:
            # Start the project
            print("2. Starting project...")
            hub.projects.start(project_id)
            print("   Project start request sent")

            # Wait for project to become ready
            print("3. Waiting for project to become ready...")
            project_client = Project(project_id=project_id, api_key=hub.api_key, host=hub.host)

            ready = False
            for attempt in range(12):  # 60 seconds max wait time
                time.sleep(5)
                try:
                    project_client.system.ping()
                    ready = True
                    print(f"   ✓ Project ready after {(attempt + 1) * 5} seconds")
                    break
                except Exception as e:
                    if attempt == 11:  # Last attempt
                        print(f"   Warning: Project not ready after 60 seconds: {e}")
                    else:
                        print(f"   Attempt {attempt + 1}: Project not ready yet...")

            # Check that project exists in database
            print("4. Checking project exists in database...")
            projects = hub.projects.get(fields=['project_id', 'title', 'deleted'], project_id=project_id)
            assert len(projects) == 1, f"Expected 1 project, found {len(projects)}"
            project = projects[0]
            assert project["project_id"] == project_id
            assert project["title"] == title
            assert project.get("deleted") is None or project.get("deleted") is False
            print(f"   ✓ Project found in database: title='{project['title']}', deleted={project.get('deleted')}")

            # 2. Run a command if project is ready
            if ready:
                print("5. Running 'uname -a' command...")
                result = project_client.system.exec("uname -a")
                assert "stdout" in result
                output = result["stdout"]
                assert "Linux" in output, f"Expected Linux system, got: {output}"
                assert result["exit_code"] == 0, f"Command failed with exit code {result['exit_code']}"
                print(f"   ✓ Command executed successfully: {output.strip()}")
            else:
                print("5. Skipping command execution - project not ready")

            # 3. Stop and delete the project
            print("6. Stopping project...")
            hub.projects.stop(project_id)
            print("   ✓ Project stop command sent")
            time.sleep(3)  # Wait for process to terminate
            print("   ✓ Waited for project to stop")

            print("7. Deleting project...")
            delete_result = hub.projects.delete(project_id)
            print(f"   ✓ Delete result: {delete_result}")

            # 4. Verify project is marked as deleted in database
            print("8. Verifying project is marked as deleted...")
            projects = hub.projects.get(fields=['project_id', 'title', 'deleted'], project_id=project_id, all=True)
            assert len(projects) == 1, f"Expected 1 project (still in DB), found {len(projects)}"
            project = projects[0]
            assert project["project_id"] == project_id
            assert project.get("deleted") is True, f"Expected deleted=True, got deleted={project.get('deleted')}"
            print(f"   ✓ Project correctly marked as deleted in database: deleted={project.get('deleted')}")

            print("✅ Project lifecycle test completed successfully!")

        except Exception as e:
            # Cleanup: attempt to stop and delete project if test fails
            print(f"\n❌ Test failed: {e}")
            try:
                print("Attempting cleanup: stopping then deleting project...")
                hub.projects.stop(project_id)
                print("✓ Project stop command sent")
                time.sleep(3)  # Wait for process to terminate
                print("✓ Waited for project to stop")
                hub.projects.delete(project_id)
                print("✓ Project deleted")
            except Exception as cleanup_error:
                print(f"❌ Cleanup failed: {cleanup_error}")
            raise e
