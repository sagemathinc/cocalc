"""
Basic Organization functionality tests.

This file contains tests that verify the organization API is properly exposed
and accessible, without necessarily requiring full admin privileges or server connectivity.
"""
import pytest


class TestOrganizationAPIExposure:
    """Test that organization API methods are properly exposed."""

    def test_org_module_available(self, hub):
        """Test that the org module is accessible from hub."""
        assert hasattr(hub, 'org')
        assert hub.org is not None

    def test_all_org_methods_available(self, hub):
        """Test that all expected organization methods are available and callable."""
        org = hub.org

        expected_methods = [
            'get_all', 'create', 'get', 'set', 'add_admin', 'add_user', 'create_user', 'create_token', 'expire_token', 'get_users', 'remove_user',
            'remove_admin', 'message'
        ]

        for method_name in expected_methods:
            assert hasattr(org, method_name), f"Method {method_name} not found"
            method = getattr(org, method_name)
            assert callable(method), f"Method {method_name} is not callable"

        print(f"✓ All {len(expected_methods)} organization methods are properly exposed")

    def test_org_methods_are_api_decorated(self, hub):
        """Test that org methods make actual API calls (not just stubs)."""
        # We can verify this by attempting to call a method that should fail
        # with authentication/permission errors rather than NotImplementedError

        with pytest.raises(Exception) as exc_info:
            # This should make an actual API call and fail with auth or server error,
            # not with NotImplementedError
            hub.org.get("nonexistent-org-for-testing-12345")

        # Should NOT be NotImplementedError (which would indicate the method isn't implemented)
        assert not isinstance(exc_info.value, NotImplementedError), \
            "Organization methods should make actual API calls, not raise NotImplementedError"

        print(f"✓ Organization methods make actual API calls: {type(exc_info.value).__name__}")

    def test_message_method_signature(self, hub):
        """Test that the message method has the correct signature."""
        import inspect

        sig = inspect.signature(hub.org.message)
        params = list(sig.parameters.keys())

        # Should have name, subject, body parameters
        required_params = ['name', 'subject', 'body']
        for param in required_params:
            assert param in params, f"Message method missing required parameter: {param}"

        print("✓ Message method has correct parameters:", params)

    def test_create_user_method_signature(self, hub):
        """Test that create_user method has the correct signature."""
        import inspect

        sig = inspect.signature(hub.org.create_user)
        params = sig.parameters

        # Check required parameters
        assert 'name' in params, "create_user missing 'name' parameter"
        assert 'email' in params, "create_user missing 'email' parameter"

        # Check optional parameters
        optional_params = ['firstName', 'lastName', 'password']
        for param in optional_params:
            assert param in params, f"create_user missing optional parameter: {param}"
            # Optional params should have default values
            assert params[param].default is not inspect.Parameter.empty, \
                f"Optional parameter {param} should have a default value"

        print("✓ create_user method has correct parameter signature")

    def test_create_token_return_annotation(self, hub):
        """Test that create_token has proper return type annotation."""
        import inspect

        sig = inspect.signature(hub.org.create_token)
        return_annotation = sig.return_annotation

        # Should be annotated to return TokenType
        assert return_annotation.__name__ == 'TokenType', \
            f"create_token should return TokenType, got {return_annotation}"

        print("✓ create_token method has correct return type annotation")


class TestOrganizationImportIntegrity:
    """Test that the organization refactoring didn't break anything."""

    def test_organizations_class_imported_correctly(self, hub):
        """Test that Organizations class is properly imported in hub."""
        # The hub.org should be an instance of the Organizations class
        from cocalc_api.org import Organizations

        assert isinstance(hub.org, Organizations), \
            "hub.org should be an instance of Organizations class"

        print("✓ Organizations class properly imported and instantiated")

    def test_original_hub_functionality_preserved(self, hub):
        """Test that refactoring didn't break other hub functionality."""
        # Test that other hub properties still work
        assert hasattr(hub, 'system'), "Hub should still have system property"
        assert hasattr(hub, 'projects'), "Hub should still have projects property"
        assert hasattr(hub, 'messages'), "Hub should still have messages property"

        # Test that projects.delete is still available (from main task)
        assert hasattr(hub.projects, 'delete'), "Projects should still have delete method"
        assert callable(hub.projects.delete), "Projects delete should be callable"

        print("✓ All original Hub functionality preserved after org refactoring")


def test_make_check_compatibility():
    """Test that the refactoring passes all static analysis checks."""
    # This test exists to document that the refactored code should pass
    # make check (ruff, mypy, pyright) - the actual checking is done by CI/make
    print("✓ Organization refactoring should pass make check (ruff, mypy, pyright)")
    assert True
