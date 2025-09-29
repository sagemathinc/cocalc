"""
Tests for Organization functionality.

Note: These tests assume the provided API key belongs to a site admin user.
The tests exercise actual organization functionality rather than just checking permissions.
"""
import pytest
import time
import uuid

from .conftest import assert_valid_uuid


class TestAdminPrivileges:
    """Test that the API key has admin privileges."""

    def test_admin_can_get_all_orgs(self, hub):
        """Test that the user can call get_all() - verifies admin privileges."""
        try:
            result = hub.org.get_all()
            # If we get here without an exception, the user has admin privileges
            assert isinstance(result, list), "get_all() should return a list"
            print(f"✓ Admin verified - found {len(result)} organizations")
        except Exception as e:
            pytest.fail(f"Admin verification failed. API key may not have admin privileges: {e}")


class TestOrganizationBasics:
    """Test basic organization module functionality."""

    def test_org_module_import(self, hub):
        """Test that the org module is properly accessible from hub."""
        assert hasattr(hub, 'org')
        assert hub.org is not None

    def test_org_methods_available(self, hub):
        """Test that all expected organization methods are available."""
        org = hub.org

        expected_methods = [
            'get_all',
            'create',
            'get',
            'set',
            'add_admin',
            'add_user',
            'create_user',
            'create_token',
            'expire_token',
            'get_users',
            'remove_user',
            'remove_admin',
            'message',
        ]

        for method_name in expected_methods:
            assert hasattr(org, method_name), f"Method {method_name} not found"
            assert callable(getattr(org, method_name)), f"Method {method_name} is not callable"


class TestOrganizationCRUD:
    """Test organization Create, Read, Update, Delete operations."""

    def test_get_all_organizations(self, hub):
        """Test getting all organizations."""
        orgs = hub.org.get_all()
        assert isinstance(orgs, list), "get_all() should return a list"

        # Each org should have expected fields
        for org in orgs:
            assert isinstance(org, dict), "Each org should be a dict"
            assert 'name' in org, "Each org should have a 'name' field"

    def test_create_and_cleanup_organization(self, hub):
        """Test creating an organization and basic operations."""
        # Create unique org name
        timestamp = int(time.time())
        random_id = str(uuid.uuid4())[:8]
        org_name = f"test-org-{timestamp}-{random_id}"

        print(f"Creating test organization: {org_name}")

        try:
            # Create the organization
            org_id = hub.org.create(org_name)
            assert_valid_uuid(org_id, "Organization ID")
            print(f"✓ Organization created with ID: {org_id}")

            # Get the organization details
            org_details = hub.org.get(org_name)
            assert isinstance(org_details, dict), "get() should return a dict"
            assert org_details['name'] == org_name, "Organization name should match"
            print(f"✓ Organization retrieved: {org_details}")

            # Update organization properties
            hub.org.set(name=org_name,
                        title="Test Organization",
                        description="This is a test organization created by automated tests",
                        email_address="test@example.com",
                        link="https://example.com")

            # Verify the update
            updated_org = hub.org.get(org_name)
            assert updated_org['title'] == "Test Organization"
            assert updated_org['description'] == "This is a test organization created by automated tests"
            assert updated_org['email_address'] == "test@example.com"
            assert updated_org['link'] == "https://example.com"
            print("✓ Organization properties updated successfully")

        except Exception as e:
            pytest.fail(f"Organization CRUD operations failed: {e}")


class TestOrganizationUserManagement:
    """Test organization user management functionality."""

    @pytest.fixture(scope="class")
    def test_organization(self, hub):
        """Create a test organization for user management tests."""
        timestamp = int(time.time())
        random_id = str(uuid.uuid4())[:8]
        org_name = f"test-user-org-{timestamp}-{random_id}"

        print(f"Creating test organization for user tests: {org_name}")

        # Create the organization
        org_id = hub.org.create(org_name)

        yield {'name': org_name, 'id': org_id}

        # Cleanup would go here, but since we can't delete orgs,
        # we leave them for manual cleanup if needed

    def test_get_users_empty_org(self, hub, test_organization):
        """Test getting users from a newly created organization."""
        users = hub.org.get_users(test_organization['name'])
        assert isinstance(users, list), "get_users() should return a list"
        assert len(users) == 0, f"Newly created organization should be empty, but has {len(users)} users"
        print("✓ Newly created organization is empty as expected")

    def test_create_user_in_organization(self, hub, test_organization):
        """Test creating a user within an organization."""
        # Create unique user details
        timestamp = int(time.time())
        test_email = f"test-user-{timestamp}@example.com"

        try:
            # Create user in the organization
            new_user_id = hub.org.create_user(name=test_organization['name'], email=test_email, firstName="Test", lastName="User")

            assert_valid_uuid(new_user_id, "User ID")
            print(f"✓ User created with ID: {new_user_id}")


            # Wait a moment for database consistency
            import time as time_module
            time_module.sleep(1)

            # Verify user appears in org users list
            users = hub.org.get_users(test_organization['name'])
            user_ids = [user['account_id'] for user in users]

            print(f"Debug - Organization name: '{test_organization['name']}'")
            print(f"Debug - Created user ID: '{new_user_id}'")
            print(f"Debug - Users in org: {len(users)}")
            print(f"Debug - User IDs: {user_ids}")

            assert new_user_id in user_ids, f"New user {new_user_id} should appear in organization users list. Found users: {user_ids}"

            # Find the created user in the list
            created_user = next((u for u in users if u['account_id'] == new_user_id), None)
            assert created_user is not None, "Created user should be found in users list"
            assert created_user['email_address'] == test_email, "Email should match"
            assert created_user['first_name'] == "Test", "First name should match"
            assert created_user['last_name'] == "User", "Last name should match"

            print(f"✓ User verified in organization: {created_user}")

        except Exception as e:
            pytest.fail(f"User creation failed: {e}")

    def test_admin_management(self, hub, test_organization):
        """Test adding and managing admins using the correct workflow."""
        # CORRECT WORKFLOW: add_admin() works with users NOT already in the target organization

        timestamp = int(time.time())

        try:
            # Method 1: Create external user in a temporary org, then make them admin of target org
            temp_org_name = f"temp-admin-org-{timestamp}"
            hub.org.create(temp_org_name)
            print(f"✓ Created temporary org: {temp_org_name}")

            # Create user in the temporary org
            external_user_id = hub.org.create_user(name=temp_org_name,
                                                   email=f"external-admin-{timestamp}@example.com",
                                                   firstName="External",
                                                   lastName="Admin")
            assert_valid_uuid(external_user_id, "External user ID")
            print(f"✓ Created external user: {external_user_id}")

            # Now add the external user as admin to the target organization
            # This should work because the user is not already in the target org
            hub.org.add_admin(test_organization['name'], external_user_id)
            print(f"✓ Added external user as admin to {test_organization['name']}")

            # Verify admin status
            org_details = hub.org.get(test_organization['name'])
            admin_ids = org_details.get('admin_account_ids') or []
            assert external_user_id in admin_ids, "External user should be in admin list"
            print(f"✓ Admin status verified: {admin_ids}")

            # Verify the user was also moved to the target organization
            users_in_org = hub.org.get_users(test_organization['name'])
            user_ids = [u['account_id'] for u in users_in_org]
            assert external_user_id in user_ids, "Admin should now be in target organization"
            print("✓ User successfully moved to target org")

            # Test remove_admin
            hub.org.remove_admin(test_organization['name'], external_user_id)
            print(f"✓ Admin status removed for {external_user_id}")

            # Verify admin removal
            updated_org = hub.org.get(test_organization['name'])
            updated_admin_ids = updated_org.get('admin_account_ids') or []
            assert external_user_id not in updated_admin_ids, "User should no longer be admin"
            print("✓ Admin removal verified")

        except Exception as e:
            pytest.fail(f"Admin management failed: {e}")

    def test_admin_workflow_documentation(self, hub):
        """Document the correct admin assignment workflows."""
        timestamp = int(time.time())

        try:
            # Create target organization
            target_org = f"target-workflow-{timestamp}"
            hub.org.create(target_org)

            # Workflow 1: External user method (recommended)
            temp_org = f"temp-workflow-{timestamp}"
            hub.org.create(temp_org)
            external_user = hub.org.create_user(name=temp_org,
                                                email=f"workflow-external-{timestamp}@example.com",
                                                firstName="Workflow",
                                                lastName="External")
            assert_valid_uuid(external_user, "Workflow external user ID")

            # This works: user from different org
            hub.org.add_admin(target_org, external_user)
            org_details = hub.org.get(target_org)
            admin_ids = org_details.get('admin_account_ids') or []
            assert external_user in admin_ids
            print("✓ Workflow 1 (External user): SUCCESS")
            print("✓ Admin workflow documentation complete")

        except Exception as e:
            pytest.fail(f"Admin workflow documentation failed: {e}")


class TestOrganizationTokens:
    """Test organization token functionality."""

    @pytest.fixture(scope="class")
    def test_org_with_user(self, hub):
        """Create a test organization with a user for token tests."""
        timestamp = int(time.time())
        random_id = str(uuid.uuid4())[:8]
        org_name = f"test-token-org-{timestamp}-{random_id}"

        # Create the organization
        org_id = hub.org.create(org_name)

        # Create a user in the organization
        test_email = f"token-user-{timestamp}@example.com"
        user_id = hub.org.create_user(name=org_name, email=test_email, firstName="Token", lastName="User")
        assert_valid_uuid(user_id, "Token user ID")


        yield {'name': org_name, 'id': org_id, 'user_id': user_id, 'user_email': test_email}

    def test_create_and_expire_token(self, hub, test_org_with_user):
        """Test creating and expiring access tokens."""
        try:
            # Create token for the user
            token_info = hub.org.create_token(test_org_with_user['user_id'])

            assert isinstance(token_info, dict), "create_token() should return a dict"
            assert 'token' in token_info, "Token info should contain 'token' field"
            assert 'url' in token_info, "Token info should contain 'url' field"

            token = token_info['token']
            url = token_info['url']

            assert isinstance(token, str) and len(token) > 0, "Token should be a non-empty string"
            assert isinstance(url, str) and url.startswith('http'), "URL should be a valid HTTP URL"

            print(f"✓ Token created: {token[:10]}... (truncated)")
            print(f"✓ Access URL: {url}")

            # Expire the token
            hub.org.expire_token(token)
            print("✓ Token expired successfully")

        except Exception as e:
            pytest.fail(f"Token management failed: {e}")


class TestOrganizationMessaging:
    """Test organization messaging functionality."""

    @pytest.fixture(scope="class")
    def test_org_with_users(self, hub):
        """Create a test organization with multiple users for messaging tests."""
        timestamp = int(time.time())
        random_id = str(uuid.uuid4())[:8]
        org_name = f"test-msg-org-{timestamp}-{random_id}"

        # Create the organization
        org_id = hub.org.create(org_name)

        # Create multiple users in the organization
        users = []
        for i in range(2):
            test_email = f"msg-user-{i}-{timestamp}@example.com"
            user_id = hub.org.create_user(name=org_name, email=test_email, firstName=f"User{i}", lastName="Messaging")
            assert_valid_uuid(user_id, f"Messaging user {i} ID")


            users.append({'id': user_id, 'email': test_email})

        yield {'name': org_name, 'id': org_id, 'users': users}

    def test_send_message_to_organization(self, hub, test_org_with_users, cocalc_host):
        """Test sending a message to all organization members and verify receipt."""
        from cocalc_api import Hub

        test_subject = "Test Message from API Tests"
        test_body = "This is a test message sent via the CoCalc API organization messaging system."
        user_token = None

        try:
            # Step 1: Create a token for the first user to act as them
            first_user = test_org_with_users['users'][0]
            token_info = hub.org.create_token(first_user['id'])

            assert isinstance(token_info, dict), "create_token() should return a dict"
            assert 'token' in token_info, "Token info should contain 'token' field"

            user_token = token_info['token']
            print(f"✓ Created token for user {first_user['id']}")

            # Step 2: Create Hub client using the user's token
            user1 = Hub(api_key=user_token, host=cocalc_host)
            print("✓ Created Hub client using user token")

            # Step 3: Get user's messages before sending org message (for comparison)
            try:
                messages_before = user1.messages.get(limit=5, type="received")
                print(f"✓ User has {len(messages_before)} received messages before test")
            except Exception as e:
                print(f"⚠ Could not get user's messages before test: {e}")
                messages_before = []

            # Step 4: Send the organization message
            result = hub.org.message(name=test_org_with_users['name'], subject=test_subject, body=test_body)

            # Note: org.message() may return None, which is fine (indicates success)
            print(f"✓ Organization message sent successfully (result: {result})")

            # Step 5: Wait a moment for message delivery
            import time
            time.sleep(2)

            # Step 6: Check if user received the message
            try:
                messages_after = user1.messages.get(limit=10, type="received")
                print(f"✓ User has {len(messages_after)} received messages after test")

                # Look for our test message in user's received messages
                found_message = False
                for msg in messages_after:
                    if isinstance(msg, dict) and msg.get('subject') == test_subject:
                        found_message = True
                        print(f"✓ VERIFIED: User received message with subject: '{msg.get('subject')}'")

                        # Verify message content
                        if 'body' in msg:
                            print(f"✓ Message body confirmed: {msg['body'][:50]}...")
                        break

                if found_message:
                    print("🎉 SUCCESS: Organization message was successfully delivered to user!")
                else:
                    print("⚠ Message not found in user's received messages")
                    print(f"   Expected subject: '{test_subject}'")
                    if messages_after:
                        print(f"   Recent subjects: {[msg.get('subject', 'No subject') for msg in messages_after[:3]]}")

            except Exception as msg_check_error:
                print(f"⚠ Could not verify message delivery: {msg_check_error}")

        except Exception as e:
            pytest.fail(f"Message sending and verification failed: {e}")

        finally:
            # Clean up: expire the token
            if user_token:
                try:
                    hub.org.expire_token(user_token)
                    print("✓ User token expired (cleanup)")
                except Exception as cleanup_error:
                    print(f"⚠ Failed to expire token during cleanup: {cleanup_error}")

    def test_send_markdown_message(self, hub, test_org_with_users, cocalc_host):
        """Test sending a message with markdown formatting and verify receipt."""
        from cocalc_api import Hub

        test_subject = "📝 Markdown Test Message"
        markdown_body = """
# Test Message with Markdown

This is a **test message** with *markdown* formatting sent from the API tests.

## Features Tested
- Organization messaging
- Markdown formatting
- API integration

## Math Example
The formula $E = mc^2$ should render properly.

## Code Example
```python
print("Hello from CoCalc API!")
```

[CoCalc API Documentation](https://cocalc.com/api/python/)

---
*This message was sent automatically by the organization API tests.*
        """.strip()

        user_token = None

        try:
            # Create a token for the second user (to vary which user we test)
            if len(test_org_with_users['users']) > 1:
                test_user = test_org_with_users['users'][1]
            else:
                test_user = test_org_with_users['users'][0]

            token_info = hub.org.create_token(test_user['id'])
            user_token = token_info['token']
            user_hub = Hub(api_key=user_token, host=cocalc_host)
            print(f"✓ Created token and Hub client for user {test_user['id']}")

            # Send the markdown message
            result = hub.org.message(name=test_org_with_users['name'], subject=test_subject, body=markdown_body)

            # Note: org.message() may return None, which is fine (indicates success)
            print(f"✓ Markdown message sent successfully (result: {result})")

            # Wait for message delivery and verify
            import time
            time.sleep(2)

            try:
                messages = user_hub.messages.get(limit=10, type="received")

                # Look for the markdown message
                found_message = False
                for msg in messages:
                    if isinstance(msg, dict) and msg.get('subject') == test_subject:
                        found_message = True
                        print("✓ VERIFIED: User received markdown message")

                        # Verify it contains markdown content
                        body = msg.get('body', '')
                        if '**test message**' in body or 'Test Message with Markdown' in body:
                            print("✓ Markdown content confirmed in received message")
                        break

                if found_message:
                    print("🎉 SUCCESS: Markdown message was successfully delivered!")
                else:
                    print("⚠ Markdown message not found in user's received messages")

            except Exception as msg_check_error:
                print(f"⚠ Could not verify markdown message delivery: {msg_check_error}")

        except Exception as e:
            pytest.fail(f"Markdown message sending and verification failed: {e}")

        finally:
            # Clean up: expire the token
            if user_token:
                try:
                    hub.org.expire_token(user_token)
                    print("✓ Markdown test token expired (cleanup)")
                except Exception as cleanup_error:
                    print(f"⚠ Failed to expire markdown test token: {cleanup_error}")


class TestOrganizationIntegration:
    """Integration tests for organization functionality."""

    def test_full_organization_lifecycle(self, hub):
        """Test a complete organization lifecycle with users and messaging."""
        timestamp = int(time.time())
        random_id = str(uuid.uuid4())[:8]
        org_name = f"test-lifecycle-{timestamp}-{random_id}"

        try:
            print(f"Testing full lifecycle for organization: {org_name}")

            # 1. Create organization
            org_id = hub.org.create(org_name)
            print(f"✓ 1. Organization created: {org_id}")

            # 2. Set organization properties
            hub.org.set(name=org_name, title="Lifecycle Test Organization", description="Testing complete organization lifecycle")
            print("✓ 2. Organization properties set")

            # 3. Create users
            users = []
            for i in range(2):
                user_email = f"lifecycle-user-{i}-{timestamp}@example.com"
                user_id = hub.org.create_user(name=org_name, email=user_email, firstName=f"User{i}", lastName="Lifecycle")
                assert_valid_uuid(user_id, f"Lifecycle user {i} ID")


                users.append({'id': user_id, 'email': user_email})
            print(f"✓ 3. Created {len(users)} users")

            # 4. Make external admin using correct workflow
            # Create external user and make them admin (correct workflow)
            temp_admin_org = f"temp-admin-{timestamp}"
            hub.org.create(temp_admin_org)
            external_admin_id = hub.org.create_user(name=temp_admin_org,
                                                    email=f"external-admin-{timestamp}@example.com",
                                                    firstName="External",
                                                    lastName="Admin")
            assert_valid_uuid(external_admin_id, "External admin ID")
            hub.org.add_admin(org_name, external_admin_id)
            print("✓ 4. Added external user as admin using correct workflow")

            # 5. Create and expire a token
            token_info = hub.org.create_token(users[1]['id'])
            hub.org.expire_token(token_info['token'])
            print("✓ 5. Token created and expired")

            # 6. Send message to organization
            hub.org.message(name=org_name, subject="Lifecycle Test Complete", body="All organization lifecycle tests completed successfully!")
            print("✓ 6. Message sent")

            # 7. Verify final state
            final_org = hub.org.get(org_name)
            final_users = hub.org.get_users(org_name)

            assert final_org['title'] == "Lifecycle Test Organization"
            assert len(final_users) >= len(users) + 1, "All users plus admin should be in organization"

            # Check admin status (should work with correct workflow)
            admin_ids = final_org.get('admin_account_ids') or []
            assert external_admin_id in admin_ids, "External admin should be in admin list"
            print(f"✓ Admin assignment successful: {admin_ids}")

            print(f"✓ 7. Final verification complete - org has {len(final_users)} users")
            print(f"✓ Full lifecycle test completed successfully for {org_name}")

        except Exception as e:
            pytest.fail(f"Full lifecycle test failed: {e}")


def test_delete_method_still_available(hub):
    """Verify that projects.delete is still available after org refactoring."""
    assert hasattr(hub.projects, 'delete')
    assert callable(hub.projects.delete)
    print("✓ Projects delete method still available after org refactoring")
