"""
Tests for Jupyter kernel functionality.

Note: These tests are skipped in CI environments due to unreliable Jupyter setup
in containerized environments. They are thoroughly tested locally.
"""

import os
import pytest

# Import helper from conftest
from tests.conftest import retry_with_backoff

# Skip all Jupyter tests in CI (GitHub Actions)
# Jupyter kernel startup and execution is unreliable in containerized CI environments
pytestmark = pytest.mark.skipif(os.environ.get("CI") == "true", reason="Jupyter tests skipped in CI due to environment constraints")


class TestJupyterKernelSetup:
    """Tests for Jupyter kernel installation and availability."""

    def test_install_ipykernel(self, project_client):
        """Test installing ipykernel in the project."""
        # Install ipykernel package
        result = project_client.system.exec(
            command="python3",
            args=["-m", "pip", "install", "ipykernel"],
            timeout=120,  # 2 minutes should be enough for pip install
        )

        # Check that installation succeeded
        assert result["exit_code"] == 0
        assert "stderr" in result

    def test_install_jupyter_kernel(self, project_client):
        """Test installing the Python 3 Jupyter kernel."""
        # Install the kernel spec
        result = project_client.system.exec(
            command="python3",
            args=[
                "-m",
                "ipykernel",
                "install",
                "--user",  # Install to user location, not system
                "--name=python3",
                "--display-name=Python 3",
            ],
            timeout=30,
        )

        # Check that kernel installation succeeded
        assert result["exit_code"] == 0


class TestJupyterKernels:
    """Tests for Jupyter kernel availability."""

    def test_kernels_list_with_project(self, hub, temporary_project):
        """Test getting kernel specs for a specific project."""
        project_id = temporary_project["project_id"]
        kernels = hub.jupyter.kernels(project_id=project_id)

        # Should return a list of kernel specs
        assert isinstance(kernels, list)
        assert len(kernels) > 0

    def test_python3_kernel_available(self, hub, temporary_project):
        """Test that the python3 kernel is available after installation."""
        project_id = temporary_project["project_id"]
        kernels = hub.jupyter.kernels(project_id=project_id)

        # Extract kernel names from the list
        kernel_names = [k.get("name") for k in kernels if isinstance(k, dict)]
        assert "python3" in kernel_names


class TestJupyterExecuteViaHub:
    """Tests for executing code via hub.jupyter.execute()."""

    def test_execute_simple_sum(self, hub, temporary_project):
        """Test executing a simple sum using the python3 kernel.

        Note: First execution may take longer as kernel needs to start up (30+ seconds).
        In CI environments, this can take even longer, so we use more retries.
        """
        project_id = temporary_project["project_id"]

        result = retry_with_backoff(lambda: hub.jupyter.execute(input="sum(range(100))", kernel="python3", project_id=project_id),
                                    max_retries=5,
                                    retry_delay=10)

        # Check the result structure
        assert isinstance(result, dict)
        assert "output" in result

        # Check that we got the correct result (sum of 0..99 = 4950)
        output = result["output"]
        assert len(output) > 0

        # Extract the result from the output
        # Format: [{'data': {'text/plain': '4950'}}]
        first_output = output[0]
        assert "data" in first_output
        assert "text/plain" in first_output["data"]
        assert first_output["data"]["text/plain"] == "4950"

    def test_execute_with_history(self, hub, temporary_project):
        """Test executing code with history context."""
        project_id = temporary_project["project_id"]

        result = retry_with_backoff(
            lambda: hub.jupyter.execute(history=["a = 100"], input="sum(range(a + 1))", kernel="python3", project_id=project_id))

        # Check the result (sum of 0..100 = 5050)
        assert isinstance(result, dict)
        assert "output" in result

        output = result["output"]
        assert len(output) > 0

        first_output = output[0]
        assert "data" in first_output
        assert "text/plain" in first_output["data"]
        assert first_output["data"]["text/plain"] == "5050"

    def test_execute_print_statement(self, hub, temporary_project):
        """Test executing code that prints output.

        Note: First execution may take longer as kernel needs to start up (30+ seconds).
        """
        project_id = temporary_project["project_id"]

        result = retry_with_backoff(lambda: hub.jupyter.execute(input='print("Hello from Jupyter")', kernel="python3", project_id=project_id))

        # Check that we got output
        assert isinstance(result, dict)
        assert "output" in result

        output = result["output"]
        assert len(output) > 0

        # Print statements produce stream output
        first_output = output[0]
        assert "name" in first_output
        assert first_output["name"] == "stdout"
        assert "text" in first_output
        assert "Hello from Jupyter" in first_output["text"]


class TestJupyterExecuteViaProject:
    """Tests for executing code via project.system.jupyter_execute()."""

    def test_jupyter_execute_simple_sum(self, project_client):
        """
        Test executing a simple sum via project API.

        The result is a list of output items directly (not wrapped in a dict).

        Note: First execution may take longer as kernel needs to start up (30+ seconds).
        """
        result = retry_with_backoff(lambda: project_client.system.jupyter_execute(input="sum(range(100))", kernel="python3"))

        # Result is a list, not a dict with 'output' key
        assert isinstance(result, list)
        assert len(result) > 0

        # Check that we got the correct result (sum of 0..99 = 4950)
        first_output = result[0]
        assert "data" in first_output
        assert "text/plain" in first_output["data"]
        assert first_output["data"]["text/plain"] == "4950"

    def test_jupyter_execute_with_history(self, project_client):
        """
        Test executing code with history via project API.

        The result is a list of output items directly.

        Note: First execution may take longer as kernel needs to start up (30+ seconds).
        """
        result = retry_with_backoff(lambda: project_client.system.jupyter_execute(history=["b = 50"], input="b * 2", kernel="python3"))

        # Result is a list
        assert isinstance(result, list)
        assert len(result) > 0

        # Check the result (50 * 2 = 100)
        first_output = result[0]
        assert "data" in first_output
        assert "text/plain" in first_output["data"]
        assert first_output["data"]["text/plain"] == "100"

    def test_jupyter_execute_list_operation(self, project_client):
        """
        Test executing code that works with lists.

        The result is a list of output items directly.
        """
        result = retry_with_backoff(lambda: project_client.system.jupyter_execute(input="[x**2 for x in range(5)]", kernel="python3"))

        # Result is a list
        assert isinstance(result, list)
        assert len(result) > 0

        # Check the result ([0, 1, 4, 9, 16])
        first_output = result[0]
        assert "data" in first_output
        assert "text/plain" in first_output["data"]
        assert first_output["data"]["text/plain"] == "[0, 1, 4, 9, 16]"


class TestJupyterKernelManagement:
    """Tests for Jupyter kernel management (list and stop kernels)."""

    def test_list_jupyter_kernels(self, project_client):
        """Test listing running Jupyter kernels."""
        # First execute some code to ensure a kernel is running
        retry_with_backoff(lambda: project_client.system.jupyter_execute(input="1+1", kernel="python3"))

        # List kernels
        kernels = project_client.system.list_jupyter_kernels()

        # Should return a list
        assert isinstance(kernels, list)

        # Should have at least one kernel running (from previous tests)
        assert len(kernels) > 0

        # Each kernel should have required fields
        for kernel in kernels:
            assert "pid" in kernel
            assert "connectionFile" in kernel
            assert isinstance(kernel["pid"], int)
            assert isinstance(kernel["connectionFile"], str)

    def test_stop_jupyter_kernel(self, project_client):
        """Test stopping a specific Jupyter kernel."""
        # Execute code to start a kernel
        retry_with_backoff(lambda: project_client.system.jupyter_execute(input="1+1", kernel="python3"))

        # List kernels
        kernels = project_client.system.list_jupyter_kernels()
        assert len(kernels) > 0

        # Stop the first kernel
        kernel_to_stop = kernels[0]
        result = project_client.system.stop_jupyter_kernel(pid=kernel_to_stop["pid"])

        # Should return success
        assert isinstance(result, dict)
        assert "success" in result
        assert result["success"] is True

        # Verify kernel is no longer in the list
        kernels_after = project_client.system.list_jupyter_kernels()
        remaining_pids = [k["pid"] for k in kernels_after]
        assert kernel_to_stop["pid"] not in remaining_pids
