#!/usr/bin/env python3
"""
Create a test project for CI tests using the cocalc-api Hub.

This script creates a temporary project for running tests that require a project ID
(e.g., cocalc-api tests with account-scoped API keys).

Outputs the project ID to stdout so it can be captured by the CI workflow.
"""

import os
import sys
import httpx


def main():
    """Create a test project and output its ID."""
    # Get configuration from environment
    api_key = os.environ.get("COCALC_API_KEY")
    host = os.environ.get("COCALC_HOST", "http://localhost:5000")

    if not api_key:
        print("Error: COCALC_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)

    try:
        # Create HTTP client with API key authentication
        client = httpx.Client(
            auth=(api_key, ""),
            headers={"Content-Type": "application/json"},
            timeout=120.0
        )

        # Call the hub API to create a project
        resp = client.post(
            f"{host}/api/conat/hub",
            json={
                "name": "projects.createProject",
                "args": [{"title": "CI Test Project"}]
            }
        )

        result = resp.json()

        # Check for errors in the response
        if "error" in result:
            print(f"Error creating project: {result['error']}", file=sys.stderr)
            sys.exit(1)

        # The result should be the project ID
        project_id = result
        if not project_id or project_id == "None":
            print(f"Error: Invalid project ID returned: {result}", file=sys.stderr)
            sys.exit(1)

        # Output the project ID to stdout
        print(project_id)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
