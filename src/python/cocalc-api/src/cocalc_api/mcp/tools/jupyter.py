"""
Jupyter kernel code execution in CoCalc project.

Provides the 'jupyter_execute' tool that allows running code using Jupyter kernels
in the target CoCalc project environment.
"""

import time
from typing import Optional, TYPE_CHECKING, Callable, TypeVar

if TYPE_CHECKING:
    pass

T = TypeVar("T")


def _is_retryable_error(error: Exception) -> bool:
    """Check if an error is retryable (transient connection issue)."""
    error_msg = str(error).lower()
    return any(keyword in error_msg for keyword in ["timeout", "closed", "connection", "reset", "broken"])


def _retry_with_backoff(
    func: Callable[[], T],
    max_retries: int = 3,
    retry_delay: int = 5,
    error_condition: Callable[[Exception], bool] | None = None,
) -> T:
    """
    Retry a function call with exponential backoff for transient failures.

    Useful for operations that may timeout on cold starts (e.g., kernel launches)
    or fail due to transient connection issues.
    """
    if error_condition is None:
        error_condition = _is_retryable_error

    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            is_retryable = error_condition(e)
            if is_retryable and attempt < max_retries - 1:
                time.sleep(retry_delay)
            else:
                raise

    # This should never be reached due to the loop, but mypy needs this
    raise RuntimeError("Retry loop exhausted without returning")


def register_jupyter_tool(mcp) -> None:
    """Register the jupyter_execute tool with the given FastMCP instance."""

    @mcp.tool()
    async def jupyter_execute(
        input: str,
        kernel: str = "python3",
        history: Optional[list[str]] = None,
    ) -> str:
        """
        Execute code using a Jupyter kernel in the CoCalc project.

        This is the primary tool for executing Python, R, Julia, or other code with rich output.
        Use this instead of 'exec' for any code that needs rich formatting or visualization.

        Jupyter kernels provide rich, interactive code execution with support for multiple
        programming languages and integrated visualization. Key features:
        - Interactive code execution with preserved state between calls
        - Rich output formatting (plots, dataframes, formatted tables, etc.)
        - Access to installed data science libraries (NumPy, Pandas, Matplotlib, etc.)
        - Display of images, HTML, LaTeX, and other media types
        - Support for different languages (Python, R, Julia, etc.)

        The kernel maintains state across multiple execute calls, so variables defined in
        one call are available in subsequent calls.

        Common use cases:
        - Computations: jupyter_execute(input="sum(range(10, 1001))", kernel="python3")
        - Data analysis: jupyter_execute(input="import pandas as pd; df = pd.read_csv('data.csv'); df.head()", kernel="python3")
        - Visualization: jupyter_execute(input="import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.show()", kernel="python3")
        - Statistical computing: jupyter_execute(input="summary(data)", kernel="ir")  # R kernel

        To set up Jupyter kernels, use the 'exec' tool:
        1. Install ipykernel: exec(command="python3", args=["-m", "pip", "install", "--user", "ipykernel"])
        2. Register Python kernel: exec(command="python3", args=["-m", "ipykernel", "install", "--user", "--name=python3", "--display-name=Python 3"])
        3. List available kernels: exec(command="jupyter kernelspec list")

        Args:
            input: Code to execute in the kernel (required)
            kernel: Name of the kernel to use (default: "python3"). Use 'exec' tool with
                   "jupyter kernelspec list" to discover available kernels.
            history: Optional list of previous code inputs to establish context. These are
                    executed without capturing output, allowing you to set up variables
                    and imports before the main input.

        Returns:
            A string containing the execution output (stdout, plots, results, errors, etc.)
        """
        from ..mcp_server import get_project_client

        try:
            project = get_project_client()

            # Use retry logic to handle cold starts and transient connection failures
            # The jupyter_execute call may timeout if the project is not running,
            # so we retry multiple times with delays to allow the project to start.
            result = _retry_with_backoff(
                lambda: project.system.jupyter_execute(
                    input=input,
                    kernel=kernel,
                    history=history,
                    timeout=30,
                ),
                max_retries=3,
                retry_delay=5,
            )

            # Format output items into readable text
            output_lines = []
            for item in result:
                if isinstance(item, dict):
                    if "data" in item:
                        # Rich output (result of expression)
                        data = item["data"]
                        if "text/plain" in data:
                            output_lines.append(data["text/plain"])
                        elif "text/html" in data:
                            output_lines.append(f"[HTML]\n{data['text/html']}")
                        elif "text/latex" in data:
                            output_lines.append(f"[LaTeX]\n{data['text/latex']}")
                        elif "image/png" in data:
                            output_lines.append("[Image: PNG]")
                        elif "image/jpeg" in data:
                            output_lines.append("[Image: JPEG]")
                    elif "name" in item and "text" in item:
                        # Stream output (print, stderr, etc.)
                        output_lines.append(f"[{item['name']}] {item['text'].rstrip()}")
                    elif "ename" in item:
                        # Error output
                        output_lines.append(f"[Error: {item.get('ename', 'Exception')}] {item.get('evalue', '')}")
                        if "traceback" in item:
                            output_lines.append("\n".join(item["traceback"]))

            if not output_lines:
                return "No output from kernel execution"

            return "\n".join(output_lines)

        except RuntimeError as e:
            error_msg = str(e)
            if "No current project set" in error_msg or "project_id" in error_msg:
                return "Error: No project set. Use set_current_project(project_id) to select a project first."
            return f"Error executing code in kernel: {error_msg}"
        except Exception as e:
            return f"Error executing code in kernel: {str(e)}"
