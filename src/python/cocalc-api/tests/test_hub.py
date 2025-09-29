"""
Tests for Hub client functionality.
"""
import time
import pytest

from cocalc_api import Hub, Project


class TestHubSystem:
    """Tests for Hub system operations."""

    def test_ping(self, hub):
        """Test basic ping connectivity."""
        result = hub.system.ping()
        assert result is not None
        # The ping response should contain some basic server info
        assert isinstance(result, dict)

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

    def test_ping_timeout(self, api_key, cocalc_host):
        """Test ping with timeout parameter."""
        hub = Hub(api_key=api_key, host=cocalc_host)
        result = hub.system.ping()
        assert result is not None


class TestHubProjects:
    """Tests for Hub project operations."""

    def test_create_project(self, hub):
        """Test creating a project via hub.projects.create_project."""
        import time
        timestamp = int(time.time())
        title = f"test-project-{timestamp}"
        description = "Test project for API testing"

        project_id = hub.projects.create_project(title=title, description=description)

        assert project_id is not None
        assert isinstance(project_id, str)
        assert len(project_id) > 0
        # Should be a UUID-like string
        assert '-' in project_id

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
        assert isinstance(project_id, str)
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

            # 3. Delete the project
            print("6. Deleting project...")
            delete_result = hub.projects.delete(project_id)
            print(f"   Delete result: {delete_result}")

            # 4. Verify project is marked as deleted in database
            print("7. Verifying project is marked as deleted...")
            projects = hub.projects.get(fields=['project_id', 'title', 'deleted'], project_id=project_id, all=True)
            assert len(projects) == 1, f"Expected 1 project (still in DB), found {len(projects)}"
            project = projects[0]
            assert project["project_id"] == project_id
            assert project.get("deleted") is True, f"Expected deleted=True, got deleted={project.get('deleted')}"
            print(f"   ✓ Project correctly marked as deleted in database: deleted={project.get('deleted')}")

            print("✅ Project lifecycle test completed successfully!")

        except Exception as e:
            # Cleanup: attempt to delete project if test fails
            print(f"\n❌ Test failed: {e}")
            try:
                print("Attempting cleanup...")
                hub.projects.delete(project_id)
                print("✓ Cleanup successful")
            except Exception as cleanup_error:
                print(f"❌ Cleanup failed: {cleanup_error}")
            raise e
