"""
Tests for Project client functionality.
"""
import os
import pytest

from cocalc_api import Project
from .conftest import assert_valid_uuid


class TestProjectCreation:
    """Tests for project creation and management."""

    def test_create_temporary_project(self, temporary_project):
        """Test that a temporary project is created successfully."""
        assert temporary_project is not None
        assert 'project_id' in temporary_project
        assert 'title' in temporary_project
        assert 'description' in temporary_project
        assert temporary_project['title'].startswith('CoCalc API Test ')
        assert temporary_project['description'] == "Temporary project created by cocalc-api tests"
        # Project ID should be a valid UUID
        assert_valid_uuid(temporary_project['project_id'], "Project ID")

    def test_project_exists_in_list(self, hub, temporary_project):
        """Test that the created project appears in the projects list."""
        projects = hub.projects.get(all=True)
        project_ids = [p['project_id'] for p in projects]
        assert temporary_project['project_id'] in project_ids


class TestProjectSystem:
    """Tests for Project system operations."""

    def test_ping(self, project_client):
        """Test basic ping connectivity to project."""
        result = project_client.system.ping()
        assert result is not None
        assert isinstance(result, dict)

    def test_project_initialization(self, api_key, cocalc_host):
        """Test Project client initialization."""
        project_id = "test-project-id"
        project = Project(project_id=project_id, api_key=api_key, host=cocalc_host)
        assert project.project_id == project_id
        assert project.api_key == api_key
        assert project.host == cocalc_host
        assert project.client is not None

    def test_project_with_temporary_project(self, project_client, temporary_project):
        """Test Project client using the temporary project."""
        assert project_client.project_id == temporary_project['project_id']
        # Test that we can ping the specific project
        result = project_client.system.ping()
        assert result is not None
        assert isinstance(result, dict)

    def test_exec_command(self, project_client):
        """Test executing shell commands in the project."""
        # Test running 'date -Is' to get ISO date with seconds
        result = project_client.system.exec(command="date", args=["-Is"])

        # Check the result structure
        assert 'stdout' in result
        assert 'stderr' in result
        assert 'exit_code' in result

        # Should succeed
        assert result['exit_code'] == 0

        # Should have minimal stderr
        assert result['stderr'] == '' or len(result['stderr']) == 0

        # Parse the returned date and compare with current time
        from datetime import datetime
        import re

        date_output = result['stdout'].strip()
        # Expected format: 2025-09-29T12:34:56+00:00 or similar

        # Check if the output matches ISO format
        iso_pattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$'
        assert re.match(iso_pattern, date_output), f"Date output '{date_output}' doesn't match ISO format"

        # Parse the date from the command output
        # Remove the timezone for comparison (date -Is includes timezone)
        date_part = date_output[:19]  # Take YYYY-MM-DDTHH:MM:SS part
        remote_time = datetime.fromisoformat(date_part)

        # Get current time
        current_time = datetime.now()

        # Check if the times are close (within 60 seconds)
        time_diff = abs((current_time - remote_time).total_seconds())
        assert time_diff < 60, f"Time difference too large: {time_diff} seconds. Remote: {date_output}, Local: {current_time.isoformat()}"

    def test_exec_stderr_and_exit_code(self, project_client):
        """Test executing a command that writes to stderr and returns a specific exit code."""
        # Use bash to echo to stderr and exit with code 42
        bash_script = "echo 'test error message' >&2; exit 42"

        # The API raises an exception for non-zero exit codes
        # but includes the stderr and exit code information in the error message
        with pytest.raises(RuntimeError) as exc_info:
            project_client.system.exec(command=bash_script, bash=True)

        error_message = str(exc_info.value)

        # Verify the error message contains expected information
        assert "exited with nonzero code 42" in error_message
        assert "stderr='test error message" in error_message

        # Extract and verify the stderr content is properly captured
        import re
        stderr_match = re.search(r"stderr='([^']*)'", error_message)
        assert stderr_match is not None, "Could not find stderr in error message"
        stderr_content = stderr_match.group(1).strip()
        assert stderr_content == "test error message"

    def test_list_jupyter_kernels(self, project_client):
        """Test listing Jupyter kernels in a project."""
        result = project_client.system.list_jupyter_kernels()
        assert isinstance(result, list)
        print(f"✓ Found {len(result)} Jupyter kernels")
        # Each kernel should have basic properties
        for kernel in result:
            assert "pid" in kernel
            assert isinstance(kernel["pid"], int)
            assert kernel["pid"] > 0

    @pytest.mark.skipif(os.environ.get("CI") == "true", reason="Jupyter tests skipped in CI due to environment constraints")
    def test_stop_jupyter_kernel(self, project_client):
        """Test stopping a Jupyter kernel.

        Note: Skipped in CI environments due to unreliable Jupyter setup.
        """
        from tests.conftest import retry_with_backoff

        # First, execute code to ensure a kernel is running with retry
        retry_with_backoff(lambda: project_client.system.jupyter_execute(input="1+1", kernel="python3"))

        # List kernels
        kernels = project_client.system.list_jupyter_kernels()
        assert len(kernels) > 0, "Expected at least one kernel to be running"

        # Stop the first kernel
        pid = kernels[0]["pid"]
        result = project_client.system.stop_jupyter_kernel(pid=pid)
        assert isinstance(result, dict)
        assert "success" in result
        print(f"✓ Stopped Jupyter kernel with PID {pid}: {result}")
