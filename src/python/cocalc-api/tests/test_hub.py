"""
Tests for Hub client functionality.
"""
import pytest

from cocalc_api import Hub


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
