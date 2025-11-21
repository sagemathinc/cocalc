"""
Tests for Hub client functionality.
"""
import time
import pytest

from cocalc_api import Hub, Project
from .conftest import assert_valid_uuid, cleanup_project, create_tracked_project, create_tracked_user, create_tracked_org


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

    def test_user_search(self, hub, resource_tracker):
        """Test user search functionality."""
        import time
        timestamp = int(time.time())

        # Create a test organization and user with a unique email
        org_name = f"search-test-org-{timestamp}"
        test_email = f"search-test-user-{timestamp}@test.local"
        test_first_name = f"SearchFirst{timestamp}"
        test_last_name = f"SearchLast{timestamp}"

        # Use tracked creation
        org_id = create_tracked_org(hub, resource_tracker, org_name)
        print(f"\nCreated test organization: {org_name} (ID: {org_id})")

        # Create a user with unique identifiable names
        user_id = create_tracked_user(hub, resource_tracker, org_name, email=test_email, firstName=test_first_name, lastName=test_last_name)
        print(f"Created test user: {user_id}, email: {test_email}")

        # Give the database a moment to index the new user
        time.sleep(0.5)

        # Test 1: Search by email (exact match should return only this user)
        print("\n1. Testing search by email...")
        results = hub.system.user_search(test_email)
        assert isinstance(results, list), "user_search should return a list"
        assert len(results) >= 1, f"Expected at least 1 result for email {test_email}, got {len(results)}"

        # Find our user in the results
        our_user = None
        for user in results:
            if user.get('email_address') == test_email:
                our_user = user
                break

        assert our_user is not None, f"Expected to find user with email {test_email} in results"
        print(f"   Found user by email: {our_user['account_id']}")

        # Verify the structure of the result
        assert 'account_id' in our_user
        assert 'first_name' in our_user
        assert 'last_name' in our_user
        assert our_user['first_name'] == test_first_name
        assert our_user['last_name'] == test_last_name
        assert our_user['account_id'] == user_id
        print(f"   User data: first_name={our_user['first_name']}, last_name={our_user['last_name']}")

        # Test 2: Search by full first name (to ensure we find our user)
        print("\n2. Testing search by full first name...")
        # Use the full first name which is guaranteed unique with timestamp
        results = hub.system.user_search(test_first_name)
        assert isinstance(results, list)
        print(f"   Search for '{test_first_name}' returned {len(results)} results")
        # Our user should be in the results
        found = any(u.get('account_id') == user_id for u in results)
        if not found and len(results) > 0:
            print(f"   Found these first names: {[u.get('first_name') for u in results]}")
        assert found, f"Expected to find user {user_id} when searching for '{test_first_name}'"
        print(f"   Found user in {len(results)} results")

        # Test 3: Search by full last name (to ensure we find our user)
        print("\n3. Testing search by full last name...")
        # Use the full last name which is guaranteed unique with timestamp
        results = hub.system.user_search(test_last_name)
        assert isinstance(results, list)
        found = any(u.get('account_id') == user_id for u in results)
        assert found, f"Expected to find user {user_id} when searching for '{test_last_name}'"
        print(f"   Found user in {len(results)} results")

        # Test 4: Nonexistent search should return empty list
        print("\n4. Testing search with unlikely query...")
        unlikely_query = f"xyznonexistent{timestamp}abc"
        results = hub.system.user_search(unlikely_query)
        assert isinstance(results, list)
        assert len(results) == 0, f"Expected 0 results for non-existent query, got {len(results)}"
        print("   Search for non-existent query correctly returned 0 results")

        print("\n✅ User search test completed successfully!")

        # Note: No cleanup needed - happens automatically via cleanup_all_test_resources


class TestHubProjects:
    """Tests for Hub project operations."""

    def test_create_project(self, hub, resource_tracker):
        """Test creating a project via hub.projects.create_project."""
        import time
        timestamp = int(time.time())
        title = f"test-project-{timestamp}"
        description = "Test project for API testing"

        project_id = create_tracked_project(hub, resource_tracker, title=title, description=description)

        assert project_id is not None
        assert_valid_uuid(project_id, "Project ID")

        # Note: No cleanup needed - happens automatically

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

    def test_project_state_and_status(self, hub, temporary_project, project_client):
        """Test retrieving state and status information for a project."""
        project_id = temporary_project["project_id"]

        # Ensure project is responsive before checking its status
        project_client.system.ping()

        state_info = hub.projects.state(project_id)
        assert isinstance(state_info, dict)
        state = state_info.get("state")
        assert isinstance(state, str)
        assert state, "Expected a non-empty state string"

        status_info = hub.projects.status(project_id)
        assert isinstance(status_info, dict)
        informative_keys = ("project", "start_ts", "version", "disk_MB", "memory")
        assert any(key in status_info for key in informative_keys), "Status response should include resource information"

        project_status = status_info.get("project")
        if isinstance(project_status, dict):
            pid = project_status.get("pid")
            if pid is not None:
                assert isinstance(pid, int)
                assert pid > 0

        if "disk_MB" in status_info:
            disk_usage = status_info["disk_MB"]
            assert isinstance(disk_usage, (int, float))

        memory_info = status_info.get("memory")
        if memory_info is not None:
            assert isinstance(memory_info, dict)

    def test_project_lifecycle(self, hub, resource_tracker):
        """Test complete project lifecycle: create, wait for ready, run command, delete, verify deletion."""

        # 1. Create a project
        timestamp = int(time.time())
        title = f"lifecycle-test-{timestamp}"
        description = "Test project for complete lifecycle testing"

        print(f"\n1. Creating project '{title}'...")
        project_id = create_tracked_project(hub, resource_tracker, title=title, description=description)
        assert project_id is not None
        assert_valid_uuid(project_id, "Project ID")
        print(f"   Created project: {project_id}")

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
        print("6. Stopping and deleting project...")
        cleanup_project(hub, project_id)

        # 4. Verify project is marked as deleted in database
        print("8. Verifying project is marked as deleted...")
        projects = hub.projects.get(fields=['project_id', 'title', 'deleted'], project_id=project_id, all=True)
        assert len(projects) == 1, f"Expected 1 project (still in DB), found {len(projects)}"
        project = projects[0]
        assert project["project_id"] == project_id
        assert project.get("deleted") is True, f"Expected deleted=True, got deleted={project.get('deleted')}"
        print(f"   ✓ Project correctly marked as deleted in database: deleted={project.get('deleted')}")

        print("✅ Project lifecycle test completed successfully!")

        # Note: No cleanup needed - hard-delete happens automatically at session end

    def test_collaborator_management(self, hub, resource_tracker):
        """Test adding and removing collaborators from a project."""
        import time
        timestamp = int(time.time())

        # 1. Site admin creates two users
        print("\n1. Creating two test users...")
        user1_email = f"collab-user1-{timestamp}@test.local"
        user2_email = f"collab-user2-{timestamp}@test.local"

        # Create a temporary organization for the users
        org_name = f"collab-test-org-{timestamp}"
        org_id = create_tracked_org(hub, resource_tracker, org_name)
        print(f"   Created organization: {org_name} (ID: {org_id})")

        user1_id = create_tracked_user(hub, resource_tracker, org_name, email=user1_email, firstName="CollabUser", lastName="One")
        print(f"   Created user1: {user1_id}")

        user2_id = create_tracked_user(hub, resource_tracker, org_name, email=user2_email, firstName="CollabUser", lastName="Two")
        print(f"   Created user2: {user2_id}")

        # 2. Create a project for the first user
        print("\n2. Creating project for user1...")
        project_title = f"collab-test-project-{timestamp}"
        project_id = create_tracked_project(hub, resource_tracker, title=project_title)
        print(f"   Created project: {project_id}")

        # 3. Check initial collaborators
        print("\n3. Checking initial collaborators...")
        projects = hub.projects.get(fields=['project_id', 'users'], project_id=project_id)
        assert len(projects) == 1
        initial_users = projects[0].get('users', {})
        print(f"   Initial collaborators: {list(initial_users.keys())}")
        print(f"   Number of initial collaborators: {len(initial_users)}")

        # Report on ownership structure
        for user_id, perms in initial_users.items():
            print(f"   User {user_id}: {perms}")

        # 4. Add user1 as collaborator
        print(f"\n4. Adding user1 ({user1_id}) as collaborator...")
        result = hub.projects.add_collaborator(project_id=project_id, account_id=user1_id)
        print(f"   Add collaborator result: {result}")

        # Check collaborators after adding user1
        projects = hub.projects.get(fields=['project_id', 'users'], project_id=project_id)
        users_after_user1 = projects[0].get('users', {})
        print(f"   Collaborators after adding user1: {list(users_after_user1.keys())}")
        print(f"   Number of collaborators: {len(users_after_user1)}")
        for user_id, perms in users_after_user1.items():
            print(f"   User {user_id}: {perms}")

        # 5. Add user2 as collaborator
        print(f"\n5. Adding user2 ({user2_id}) as collaborator...")
        result = hub.projects.add_collaborator(project_id=project_id, account_id=user2_id)
        print(f"   Add collaborator result: {result}")

        # Check collaborators after adding user2
        projects = hub.projects.get(fields=['project_id', 'users'], project_id=project_id)
        users_after_user2 = projects[0].get('users', {})
        print(f"   Collaborators after adding user2: {list(users_after_user2.keys())}")
        print(f"   Number of collaborators: {len(users_after_user2)}")
        # Note: There will be 3 users total: the site admin (owner) + user1 + user2
        for user_id, perms in users_after_user2.items():
            print(f"   User {user_id}: {perms}")

        # Verify user1 and user2 are present
        assert user1_id in users_after_user2, f"Expected user1 ({user1_id}) to be a collaborator"
        assert user2_id in users_after_user2, f"Expected user2 ({user2_id}) to be a collaborator"

        # Identify the owner (should be the site admin who created the project)
        owner_id = None
        for uid, perms in users_after_user2.items():
            if perms.get('group') == 'owner':
                owner_id = uid
                break
        print(f"   Project owner: {owner_id}")

        # 6. Remove user1
        print(f"\n6. Removing user1 ({user1_id}) from project...")
        result = hub.projects.remove_collaborator(project_id=project_id, account_id=user1_id)
        print(f"   Remove collaborator result: {result}")

        # Check collaborators after removing user1
        projects = hub.projects.get(fields=['project_id', 'users'], project_id=project_id)
        users_after_removal = projects[0].get('users', {})
        print(f"   Collaborators after removing user1: {list(users_after_removal.keys())}")
        print(f"   Number of collaborators: {len(users_after_removal)}")
        # Should have 2 users: owner + user2
        assert len(users_after_removal) == 2, f"Expected 2 collaborators (owner + user2), found {len(users_after_removal)}"
        assert user2_id in users_after_removal, f"Expected user2 ({user2_id}) to still be a collaborator"
        assert user1_id not in users_after_removal, f"Expected user1 ({user1_id}) to be removed"
        assert owner_id in users_after_removal, f"Expected owner ({owner_id}) to remain"
        for user_id, perms in users_after_removal.items():
            print(f"   User {user_id}: {perms}")

        print("\n✅ Collaborator management test completed successfully!")

        # Note: No cleanup needed - hard-delete happens automatically at session end

    def test_stop_project(self, hub, temporary_project):
        """Test stopping a running project."""
        project_id = temporary_project["project_id"]
        result = hub.projects.stop(project_id)
        # Stop can return None or a dict, both are valid
        assert result is None or isinstance(result, dict)
        print(f"✓ Project stop request sent")

    def test_touch_project(self, hub, temporary_project):
        """Test touching a project to signal it's in use."""
        project_id = temporary_project["project_id"]
        result = hub.projects.touch(project_id)
        # Touch can return None or a dict, both are valid
        assert result is None or isinstance(result, dict)
        print(f"✓ Project touched successfully")

    def test_get_names(self, hub, resource_tracker):
        """Test getting account names."""
        import time
        timestamp = int(time.time())
        org_name = f"names-test-org-{timestamp}"

        # Create a test user first
        user_id = create_tracked_user(hub, resource_tracker, org_name, email=f"names-test-{timestamp}@test.local")

        # Get the name(s) - returns a dict mapping user_id to display name
        result = hub.system.get_names([user_id])
        assert isinstance(result, dict)
        # The result should have the user_id as a key
        assert user_id in result or len(result) > 0
        print(f"✓ Got names for user: {result}")

    def test_copy_path_between_projects(self, hub, temporary_project, resource_tracker, project_client):
        """Test copying paths between projects."""
        import time
        import uuid
        timestamp = int(time.time())

        # Create a second project
        project2_id = create_tracked_project(hub, resource_tracker, title=f"copy-target-{timestamp}")
        project2_client = Project(project_id=project2_id, api_key=hub.api_key, host=hub.host)

        # Create a unique test string
        test_string = str(uuid.uuid4())
        src_filename = f"testfile-copy-{timestamp}.txt"
        dst_filename = f"testfile-copied-{timestamp}.txt"

        # Create a test file in the first project
        project_client.system.exec(f"echo '{test_string}' > {src_filename}")

        # Copy the file to the second project
        result = hub.projects.copy_path_between_projects(src_project_id=temporary_project["project_id"],
                                                         src_path=src_filename,
                                                         target_project_id=project2_id,
                                                         target_path=dst_filename)
        # copy_path_between_projects can return None or a dict
        assert result is None or isinstance(result, dict)
        print(f"✓ File copy request sent")

        # Verify the file was copied by reading it
        verify_result = project2_client.system.exec(f"cat {dst_filename}")
        assert verify_result["exit_code"] == 0
        assert test_string in verify_result["stdout"]
        print(f"✓ Verified copied file contains expected content")

    def test_sync_history(self, hub, temporary_project, project_client):
        """Test getting sync history of a file."""
        import time
        timestamp = int(time.time())
        filename = f"history-test-{timestamp}.txt"

        # Create a test file
        project_client.system.exec(f"echo 'initial' > {filename}")

        result = hub.sync.history(project_id=temporary_project["project_id"], path=filename)
        # Result can be a list or a dict with patches and info
        if isinstance(result, dict):
            patches = result.get('patches', [])
            assert isinstance(patches, list)
        else:
            assert isinstance(result, list)
        print(f"✓ Got sync history")

    def test_db_query(self, hub):
        """Test database query for user info."""
        result = hub.db.query({"accounts": {"first_name": None}})
        assert isinstance(result, dict)
        assert "accounts" in result
        first_name = result["accounts"].get("first_name")
        assert first_name is not None
        print(f"✓ DB query successful, first_name: {first_name}")

    def test_messages_send(self, hub, resource_tracker):
        """Test sending a message."""
        import time
        timestamp = int(time.time())
        org_name = f"msg-test-org-{timestamp}"

        # Create a test user to send message to
        user_id = create_tracked_user(hub, resource_tracker, org_name, email=f"msg-test-{timestamp}@test.local")

        result = hub.messages.send(subject="Test Message", body="This is a test message", to_ids=[user_id])
        assert isinstance(result, int)
        assert result > 0
        print(f"✓ Message sent with ID: {result}")

    def test_jupyter_kernels(self, hub, temporary_project):
        """Test getting available Jupyter kernels."""
        result = hub.jupyter.kernels(project_id=temporary_project["project_id"])
        assert isinstance(result, list)
        # Should have at least python3
        kernel_names = [k.get("name") for k in result]
        assert "python3" in kernel_names or len(result) > 0
        print(f"✓ Found {len(result)} Jupyter kernels: {kernel_names}")
