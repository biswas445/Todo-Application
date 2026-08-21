"""
Comprehensive test suite for Organic Mind backend.
Tests authentication, profile, tasks, subtasks, lists, tags, notes, calendar events, and security.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from organic_mind_backend.asgi import application
from .models import List, Tag, Task, Subtask, Note, CalendarEvent, Notification
from unittest import mock
import os
import re
import subprocess
import sys
import uuid

User = get_user_model()


def extract_verification_token():
    """Pull the email-verification token out of the test mail outbox."""
    from django.core import mail
    message = mail.outbox[-1]
    match = re.search(r"token=(\S+)", message.body)
    assert match, "No verification link found in the outbox email"
    return match.group(1)


def register_and_activate(client, user_data):
    """Register via the API, follow the emailed verification link, and log in.

    Returns the login response so callers can grab the auth token.
    """
    response = client.post("/api/auth/register/", user_data)
    assert response.status_code == status.HTTP_201_CREATED, response.content
    token = extract_verification_token()
    verify = client.get(f"/api/auth/verify_email/?token={token}")
    assert verify.status_code == status.HTTP_200_OK, verify.content
    return client.post(
        "/api/auth/login/",
        {"email": user_data["email"], "password": user_data["password"]},
    )


class AuthenticationTests(TestCase):
    """Test authentication endpoints."""
    
    def setUp(self):
        self.client = APIClient()
        self.register_url = "/api/auth/register/"
        self.login_url = "/api/auth/login/"
        self.logout_url = "/api/auth/logout/"
        self.user_data = {
            "username": "testuser",
            "email": "test@example.com",
            "password": "securePass-2026x",
            "first_name": "Test",
            "last_name": "User"
        }
        
    def test_register_user(self):
        """Test registration creates an inactive account and emails a link."""
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # No token before the email is verified.
        self.assertNotIn("token", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["email"], "test@example.com")

        user = User.objects.get(email="test@example.com")
        self.assertFalse(user.is_active)
        # A verification email was sent.
        from django.core import mail
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("verify_email", mail.outbox[0].body)

    def test_register_duplicate_email_fails(self):
        """Test registering with same email fails."""
        self.client.post(self.register_url, self.user_data)
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_duplicate_email_different_username_fails_cleanly(self):
        """Test a duplicate email with a NEW username is a 400, not a 500.

        The unique constraint on email lives in Meta.constraints, which DRF
        does not enforce, so without explicit serializer validation this hit
        the database and surfaced as an IntegrityError/500.
        """
        self.client.post(self.register_url, self.user_data)
        duplicate = dict(self.user_data, username="otheruser")
        response = self.client.post(self.register_url, duplicate)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertEqual(User.objects.filter(email="test@example.com").count(), 1)

    def test_register_rejects_common_password(self):
        """Test the configured password policy is applied at registration."""
        weak = dict(self.user_data, password="password123")
        response = self.client.post(self.register_url, weak)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertFalse(User.objects.filter(email="test@example.com").exists())

    def test_register_rejects_short_password(self):
        """Test passwords shorter than the validator minimum are rejected."""
        weak = dict(self.user_data, password="x8Kp2")
        response = self.client.post(self.register_url, weak)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_verify_email_activates_account_and_allows_login(self):
        """Test the emailed link activates the account."""
        self.client.post(self.register_url, self.user_data)
        token = extract_verification_token()

        response = self.client.get(f"/api/auth/verify_email/?token={token}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(User.objects.get(email="test@example.com").is_active)

        login = self.client.post(
            self.login_url,
            {"email": "test@example.com", "password": "securePass-2026x"},
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertIn("token", login.data)

    def test_verify_email_rejects_invalid_token(self):
        """Test tampered/unknown verification tokens are rejected."""
        self.client.post(self.register_url, self.user_data)
        response = self.client.get("/api/auth/verify_email/?token=not-a-real-token")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.get(email="test@example.com").is_active)

    def test_login_before_email_verification_fails(self):
        """Test an unverified account cannot sign in."""
        self.client.post(self.register_url, self.user_data)
        login_data = {"email": "test@example.com", "password": "securePass-2026x"}
        response = self.client.post(self.login_url, login_data)
        # Uniform 401 + generic message so the endpoint cannot be used to
        # enumerate which emails hold an unverified account.
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["error"], "Invalid email or password.")

    def test_login_valid_credentials(self):
        """Test login with valid credentials returns token."""
        register_and_activate(self.client, self.user_data)
        login_data = {"email": "test@example.com", "password": "securePass-2026x"}
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials fails."""
        register_and_activate(self.client, self.user_data)
        login_data = {"email": "test@example.com", "password": "wrongpassword"}
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_missing_fields(self):
        """Test login without email or password fails."""
        response = self.client.post(self.login_url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout(self):
        """Test logout invalidates token."""
        register_and_activate(self.client, self.user_data)
        login_data = {"email": "test@example.com", "password": "securePass-2026x"}
        login_response = self.client.post(self.login_url, login_data)
        token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

        response = self.client.post(self.logout_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Token should be invalidated
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        response = self.client.get("/api/user/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ProfileTests(TestCase):
    """Test user profile management."""
    
    def setUp(self):
        self.client = APIClient()
        self.register_url = "/api/auth/register/"
        self.user_data = {
            "username": "profileuser",
            "email": "profile@example.com",
            "password": "securePass-2026x"
        }
        # Register, verify the emailed link, and login
        login_response = register_and_activate(self.client, self.user_data)
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.user = User.objects.get(email="profile@example.com")
        
    def test_get_current_user(self):
        """Test retrieving current user profile."""
        response = self.client.get("/api/user/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "profile@example.com")
        
    def test_update_display_name(self):
        """Test updating display name (username)."""
        data = {"username": "newdisplayname"}
        response = self.client.patch("/api/user/update_profile/", data)
        # Username is now immutable - should be ignored/unchanged
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Verify username didn't change
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "profileuser")
        
    def test_update_bio(self):
        """Test updating bio."""
        data = {"bio": "This is my test bio."}
        response = self.client.patch("/api/user/update_profile/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["bio"], "This is my test bio.")
        
    def test_bio_max_200_words(self):
        """Test bio cannot exceed 200 words."""
        # Create 201 words
        words = ["word"] * 201
        long_bio = " ".join(words)
        data = {"bio": long_bio}
        response = self.client.patch("/api/user/update_profile/", data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("bio", response.data)
        
    def test_bio_200_words_accepted(self):
        """Test bio with exactly 200 words is accepted."""
        words = ["word"] * 200
        exact_bio = " ".join(words)
        data = {"bio": exact_bio}
        response = self.client.patch("/api/user/update_profile/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
    def test_email_cannot_change(self):
        """Test email is immutable."""
        data = {"email": "newemail@example.com"}
        response = self.client.patch("/api/user/update_profile/", data)
        # Email should be ignored/unchanged
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Verify email didn't change
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "profile@example.com")
        
    def test_update_timezone(self):
        """Test updating timezone."""
        data = {"timezone": "Asia/Kathmandu"}
        response = self.client.patch("/api/user/update_profile/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["timezone"], "Asia/Kathmandu")
        
    def test_invalid_timezone_rejected(self):
        """Test invalid timezone format is rejected."""
        data = {"timezone": "Invalid/Timezone"}
        response = self.client.patch("/api/user/update_profile/", data)
        # Not a real IANA timezone, so it must be rejected
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("timezone", response.data)
        
    def test_update_date_format(self):
        """Test updating date format preference."""
        data = {"date_format": "MM/DD/YYYY"}
        response = self.client.patch("/api/user/update_profile/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["date_format"], "MM/DD/YYYY")
        
    def test_update_start_of_week(self):
        """Test updating start of week."""
        data = {"start_of_week": "Sunday"}
        response = self.client.patch("/api/user/update_profile/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["start_of_week"], "Sunday")
        
    def test_update_time_format(self):
        """Test updating time format."""
        data = {"time_format": "24-hour"}
        response = self.client.patch("/api/user/update_profile/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["time_format"], "24-hour")
        
    def test_update_notifications(self):
        """Test updating notification preferences."""
        data = {"push_notifications": False, "task_reminders": True}
        response = self.client.patch("/api/user/update_profile/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["push_notifications"])
        self.assertTrue(response.data["task_reminders"])
        
    def test_change_password_valid(self):
        """Test changing password with correct current password."""
        data = {
            "current_password": "securePass-2026x",
            "new_password": "Refreshed-Pass9x",
            "confirm_password": "Refreshed-Pass9x"
        }
        response = self.client.post("/api/user/change_password/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify new password works
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "profile@example.com", "password": "Refreshed-Pass9x"}
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        
    def test_change_password_wrong_current(self):
        """Test changing password with wrong current password fails."""
        data = {
            "current_password": "wrongpassword",
            "new_password": "Refreshed-Pass9x",
            "confirm_password": "Refreshed-Pass9x"
        }
        response = self.client.post("/api/user/change_password/", data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_change_password_mismatch(self):
        """Test changing password with mismatched new passwords fails."""
        data = {
            "current_password": "securePass-2026x",
            "new_password": "Refreshed-Pass9x",
            "confirm_password": "differentpassword"
        }
        response = self.client.post("/api/user/change_password/", data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_rejects_common_password(self):
        """Test the configured password policy applies to changes too."""
        data = {
            "current_password": "securePass-2026x",
            "new_password": "password123",
            "confirm_password": "password123"
        }
        response = self.client.post("/api/user/change_password/", data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_rejects_password_similar_to_username(self):
        """Test the policy compares against the account's own attributes.

        Requires the view to pass the request (and therefore the user) into
        the serializer context for UserAttributeSimilarityValidator.
        """
        data = {
            "current_password": "securePass-2026x",
            "new_password": "profileuser2026",
            "confirm_password": "profileuser2026"
        }
        response = self.client.post("/api/user/change_password/", data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ListTests(TestCase):
    """Test list CRUD operations."""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="listuser",
            email="list@example.com",
            password="securePass-2026x"
        )
        self.user2 = User.objects.create_user(
            username="listuser2",
            email="list2@example.com",
            password="securePass-2026x"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "list@example.com", "password": "securePass-2026x"}
        )
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.lists_url = "/api/lists/"
        
    def test_create_list(self):
        """Test creating a list."""
        data = {"label": "Personal", "color": "coral"}
        response = self.client.post(self.lists_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["label"], "Personal")
        
    def test_list_label_truncated(self):
        """Test list label is truncated to 60 chars."""
        # Test that validation rejects labels > 60 chars
        long_label = "a" * 100
        data = {"label": long_label, "color": "blue"}
        response = self.client.post(self.lists_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("label", response.data)
        
        # Test that 60 char label works
        exact_label = "a" * 60
        data = {"label": exact_label, "color": "blue"}
        response = self.client.post(self.lists_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["label"]), 60)
        
    def test_get_lists(self):
        """Test getting user's lists."""
        List.objects.create(user=self.user, label="Work", color="blue")
        List.objects.create(user=self.user, label="Personal", color="coral")
        List.objects.create(user=self.user2, label="Other User List", color="green")
        
        response = self.client.get(self.lists_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)

    def test_list_task_count(self):
        """Test task_count is annotated per list (not an N+1) and correct."""
        work = List.objects.create(user=self.user, label="Work", color="blue")
        personal = List.objects.create(user=self.user, label="Personal", color="coral")
        Task.objects.create(user=self.user, title="T1", list=work)
        Task.objects.create(user=self.user, title="T2", list=work)
        Task.objects.create(user=self.user, title="T3", list=personal)

        response = self.client.get(self.lists_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        counts = {item["label"]: item["task_count"] for item in response.data["results"]}
        self.assertEqual(counts["Work"], 2)
        self.assertEqual(counts["Personal"], 1)

    def test_update_list(self):
        """Test updating a list."""
        list_obj = List.objects.create(user=self.user, label="Old Label", color="yellow")
        url = f"/api/lists/{list_obj.id}/"
        data = {"label": "New Label"}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["label"], "New Label")
        
    def test_delete_list(self):
        """Test deleting a list."""
        list_obj = List.objects.create(user=self.user, label="To Delete", color="cyan")
        url = f"/api/lists/{list_obj.id}/"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(List.objects.filter(id=list_obj.id).count(), 0)
        
    def test_cannot_access_other_user_list(self):
        """Test user cannot access another user's list."""
        other_list = List.objects.create(user=self.user2, label="Other List", color="green")
        url = f"/api/lists/{other_list.id}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
    def test_cannot_update_other_user_list(self):
        """Test user cannot update another user's list."""
        other_list = List.objects.create(user=self.user2, label="Other List", color="green")
        url = f"/api/lists/{other_list.id}/"
        data = {"label": "Hacked Label"}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
    def test_cannot_delete_other_user_list(self):
        """Test user cannot delete another user's list."""
        other_list = List.objects.create(user=self.user2, label="Other List", color="green")
        url = f"/api/lists/{other_list.id}/"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class TagTests(TestCase):
    """Test tag CRUD operations."""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="taguser",
            email="tag@example.com",
            password="securePass-2026x"
        )
        self.user2 = User.objects.create_user(
            username="taguser2",
            email="tag2@example.com",
            password="securePass-2026x"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "tag@example.com", "password": "securePass-2026x"}
        )
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.tags_url = "/api/tags/"
        
    def test_create_tag(self):
        """Test creating a tag."""
        data = {"label": "Urgent", "color": "coral"}
        response = self.client.post(self.tags_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["label"], "Urgent")
        
    def test_tag_label_truncated(self):
        """Test tag label is truncated to 40 chars."""
        # Test that validation rejects labels > 40 chars
        long_label = "a" * 100
        data = {"label": long_label, "color": "blue"}
        response = self.client.post(self.tags_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("label", response.data)
        
        # Test that 40 char label works
        exact_label = "a" * 40
        data = {"label": exact_label, "color": "blue"}
        response = self.client.post(self.tags_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["label"]), 40)
        
    def test_get_tags(self):
        """Test getting user's tags."""
        Tag.objects.create(user=self.user, label="Work", color="blue")
        Tag.objects.create(user=self.user, label="Personal", color="coral")
        Tag.objects.create(user=self.user2, label="Other User Tag", color="green")
        
        response = self.client.get(self.tags_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)
        
    def test_update_tag(self):
        """Test updating a tag."""
        tag_obj = Tag.objects.create(user=self.user, label="Old Tag", color="yellow")
        url = f"/api/tags/{tag_obj.id}/"
        data = {"label": "New Tag"}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["label"], "New Tag")
        
    def test_delete_tag(self):
        """Test deleting a tag."""
        tag_obj = Tag.objects.create(user=self.user, label="To Delete", color="cyan")
        url = f"/api/tags/{tag_obj.id}/"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Tag.objects.filter(id=tag_obj.id).count(), 0)
        
    def test_cannot_access_other_user_tag(self):
        """Test user cannot access another user's tag."""
        other_tag = Tag.objects.create(user=self.user2, label="Other Tag", color="green")
        url = f"/api/tags/{other_tag.id}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
    def test_assign_own_tag_to_task(self):
        """Test assigning own tag to own task."""
        tag = Tag.objects.create(user=self.user, label="MyTag", color="blue")
        task = Task.objects.create(user=self.user, title="Test Task")
        url = f"/api/tasks/{task.id}/"
        data = {"tag_ids": [str(tag.id)]}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # tag_ids is write_only, check tags are assigned by retrieving task again
        task.refresh_from_db()
        self.assertEqual(task.tags.count(), 1)
        
    def test_cannot_assign_other_user_tag(self):
        """Test cannot assign another user's tag to task."""
        other_tag = Tag.objects.create(user=self.user2, label="OtherTag", color="green")
        task = Task.objects.create(user=self.user, title="Test Task")
        url = f"/api/tasks/{task.id}/"
        data = {"tag_ids": [str(other_tag.id)]}
        response = self.client.patch(url, data)
        # Should fail because tag is not in filtered queryset
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TaskTests(TestCase):
    """Test task CRUD operations."""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="taskuser",
            email="task@example.com",
            password="securePass-2026x"
        )
        self.user2 = User.objects.create_user(
            username="taskuser2",
            email="task2@example.com",
            password="securePass-2026x"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "task@example.com", "password": "securePass-2026x"}
        )
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.tasks_url = "/api/tasks/"
        
    def test_create_task(self):
        """Test creating a task."""
        data = {"title": "Test Task", "description": "Test description"}
        response = self.client.post(self.tasks_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "Test Task")
        
    def test_task_title_truncated(self):
        """Test task title is truncated to 120 chars."""
        # Test that validation rejects titles > 120 chars
        long_title = "a" * 200
        data = {"title": long_title}
        response = self.client.post(self.tasks_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("title", response.data)
        
        # Test that 120 char title works
        exact_title = "a" * 120
        data = {"title": exact_title}
        response = self.client.post(self.tasks_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["title"]), 120)
        
    def test_task_description_truncated(self):
        """Test task description is truncated to 2000 chars."""
        # Test that validation rejects descriptions > 2000 chars
        long_desc = "a" * 3000
        data = {"title": "Test", "description": long_desc}
        response = self.client.post(self.tasks_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("description", response.data)
        
        # Test that 2000 char description works
        exact_desc = "a" * 2000
        data = {"title": "Test", "description": exact_desc}
        response = self.client.post(self.tasks_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["description"]), 2000)
        
    def test_get_tasks(self):
        """Test getting user's tasks."""
        Task.objects.create(user=self.user, title="My Task 1")
        Task.objects.create(user=self.user, title="My Task 2")
        Task.objects.create(user=self.user2, title="Other User Task")
        
        response = self.client.get(self.tasks_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)
        
    def test_update_task(self):
        """Test updating a task."""
        task = Task.objects.create(user=self.user, title="Old Title")
        url = f"/api/tasks/{task.id}/"
        data = {"title": "New Title"}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "New Title")
        
    def test_delete_task(self):
        """Test deleting a task."""
        task = Task.objects.create(user=self.user, title="To Delete")
        url = f"/api/tasks/{task.id}/"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Task.objects.filter(id=task.id).count(), 0)
        
    def test_toggle_task_completed(self):
        """Test toggling task completion."""
        task = Task.objects.create(user=self.user, title="Test", completed=False)
        url = f"/api/tasks/{task.id}/toggle/"
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["completed"])
        
        # Toggle back
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["completed"])
        
    def test_cannot_access_other_user_task(self):
        """Test user cannot access another user's task."""
        other_task = Task.objects.create(user=self.user2, title="Other Task")
        url = f"/api/tasks/{other_task.id}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
    def test_cannot_update_other_user_task(self):
        """Test user cannot update another user's task."""
        other_task = Task.objects.create(user=self.user2, title="Other Task")
        url = f"/api/tasks/{other_task.id}/"
        data = {"title": "Hacked"}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
    def test_cannot_delete_other_user_task(self):
        """Test user cannot delete another user's task."""
        other_task = Task.objects.create(user=self.user2, title="Other Task")
        url = f"/api/tasks/{other_task.id}/"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
    def test_assign_own_list_to_task(self):
        """Test assigning own list to own task."""
        lst = List.objects.create(user=self.user, label="My List", color="blue")
        data = {"title": "Test Task", "list": str(lst.id)}
        response = self.client.post(self.tasks_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["list_id"], str(lst.id))
        
    def test_cannot_assign_other_user_list(self):
        """Test cannot assign another user's list to task."""
        other_list = List.objects.create(user=self.user2, label="Other List", color="green")
        data = {"title": "Test Task", "list": str(other_list.id)}
        response = self.client.post(self.tasks_url, data)
        # Should fail because list is not in filtered queryset
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_date_preserved(self):
        """Test date-only values are preserved without timezone shift."""
        test_dates = ["2026-08-14", "2026-08-29", "2026-08-30", "2026-01-31", "2026-12-31"]
        for test_date in test_dates:
            data = {"title": "Date Test", "due_date": test_date}
            response = self.client.post(self.tasks_url, data)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertEqual(response.data["due_date"], test_date)


class SubtaskTests(TestCase):
    """Test subtask operations."""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="subtaskuser",
            email="subtask@example.com",
            password="securePass-2026x"
        )
        self.user2 = User.objects.create_user(
            username="subtaskuser2",
            email="subtask2@example.com",
            password="securePass-2026x"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "subtask@example.com", "password": "securePass-2026x"}
        )
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.task = Task.objects.create(user=self.user, title="Parent Task")
        
    def test_add_subtask(self):
        """Test adding a subtask to task."""
        url = f"/api/tasks/{self.task.id}/add_subtask/"
        data = {"title": "Subtask 1"}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "Subtask 1")
        
    def test_subtask_title_truncated(self):
        """Test subtask title is truncated to 200 chars."""
        url = f"/api/tasks/{self.task.id}/add_subtask/"
        long_title = "a" * 300
        data = {"title": long_title}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["title"]), 200)
        
    def test_add_subtask_empty_title_fails(self):
        """Test adding subtask with empty title fails."""
        url = f"/api/tasks/{self.task.id}/add_subtask/"
        data = {"title": ""}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_toggle_subtask(self):
        """Test toggling subtask completion."""
        subtask = Subtask.objects.create(task=self.task, title="Test Subtask", completed=False)
        url = f"/api/tasks/{self.task.id}/subtasks/{subtask.id}/toggle/"
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["completed"])
        
    def test_update_subtask(self):
        """Test updating a subtask."""
        subtask = Subtask.objects.create(task=self.task, title="Old Title")
        url = f"/api/tasks/subtasks/{subtask.id}/update/"
        data = {"title": "New Title"}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "New Title")

    def test_update_subtask_empty_title_fails(self):
        """Test updating a subtask with an empty title returns 400, not a 200 no-op."""
        subtask = Subtask.objects.create(task=self.task, title="Keep Me")
        url = f"/api/tasks/subtasks/{subtask.id}/update/"
        response = self.client.patch(url, {"title": ""})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        subtask.refresh_from_db()
        self.assertEqual(subtask.title, "Keep Me")

    def test_update_subtask_non_string_title_fails(self):
        """Test updating a subtask with a non-string title returns 400, not a 500."""
        subtask = Subtask.objects.create(task=self.task, title="Keep Me")
        url = f"/api/tasks/subtasks/{subtask.id}/update/"
        response = self.client.patch(url, {"title": 12345}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        subtask.refresh_from_db()
        self.assertEqual(subtask.title, "Keep Me")

    def test_delete_subtask(self):
        """Test deleting a subtask."""
        subtask = Subtask.objects.create(task=self.task, title="To Delete")
        url = f"/api/tasks/{self.task.id}/subtasks/{subtask.id}/"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Subtask.objects.filter(id=subtask.id).count(), 0)
        
    def test_cannot_access_other_user_subtask(self):
        """Test user cannot access another user's subtask."""
        other_task = Task.objects.create(user=self.user2, title="Other Task")
        other_subtask = Subtask.objects.create(task=other_task, title="Other Subtask")
        url = f"/api/tasks/subtasks/{other_subtask.id}/update/"
        response = self.client.patch(url, {"title": "Hacked"})
        # Should 404 because parent task doesn't belong to user
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class NoteTests(TestCase):
    """Test sticky note CRUD operations."""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="noteuser",
            email="note@example.com",
            password="securePass-2026x"
        )
        self.user2 = User.objects.create_user(
            username="noteuser2",
            email="note2@example.com",
            password="securePass-2026x"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "note@example.com", "password": "securePass-2026x"}
        )
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.notes_url = "/api/notes/"
        
    def test_create_note(self):
        """Test creating a note."""
        data = {"title": "My Note", "body": "Note content"}
        response = self.client.post(self.notes_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "My Note")
        
    def test_note_title_truncated(self):
        """Test note title is truncated to 100 chars."""
        long_title = "a" * 200
        data = {"title": long_title, "body": "content"}
        response = self.client.post(self.notes_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["title"]), 100)
        
    def test_note_body_truncated(self):
        """Test note body is truncated to 2000 chars."""
        long_body = "a" * 3000
        data = {"title": "Test", "body": long_body}
        response = self.client.post(self.notes_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["body"]), 2000)
        
    def test_get_notes(self):
        """Test getting user's notes."""
        Note.objects.create(user=self.user, title="Note 1", body="Content 1")
        Note.objects.create(user=self.user, title="Note 2", body="Content 2")
        Note.objects.create(user=self.user2, title="Other Note", body="Other Content")
        
        response = self.client.get(self.notes_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)
        
    def test_update_note(self):
        """Test updating a note."""
        note = Note.objects.create(user=self.user, title="Old", body="Old body")
        url = f"/api/notes/{note.id}/"
        data = {"title": "New", "body": "New body"}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "New")
        
    def test_delete_note(self):
        """Test deleting a note."""
        note = Note.objects.create(user=self.user, title="To Delete")
        url = f"/api/notes/{note.id}/"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Note.objects.filter(id=note.id).count(), 0)
        
    def test_cannot_access_other_user_note(self):
        """Test user cannot access another user's note."""
        other_note = Note.objects.create(user=self.user2, title="Other Note")
        url = f"/api/notes/{other_note.id}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CalendarEventTests(TestCase):
    """Test calendar event CRUD operations."""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="eventuser",
            email="event@example.com",
            password="securePass-2026x"
        )
        self.user2 = User.objects.create_user(
            username="eventuser2",
            email="event2@example.com",
            password="securePass-2026x"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "event@example.com", "password": "securePass-2026x"}
        )
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.events_url = "/api/events/"
        
    def test_create_event(self):
        """Test creating a calendar event."""
        data = {
            "title": "Meeting",
            "description": "Team meeting",
            "date": "2026-08-29",
            "start_time": "10:00:00",
            "end_time": "11:00:00",
            "color": "blue"
        }
        response = self.client.post(self.events_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "Meeting")
        
    def test_event_title_truncated(self):
        """Test event title is truncated to 120 chars."""
        long_title = "a" * 200
        data = {
            "title": long_title,
            "date": "2026-08-29",
            "start_time": "10:00:00",
            "end_time": "11:00:00"
        }
        response = self.client.post(self.events_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["title"]), 120)
        
    def test_event_description_truncated(self):
        """Test event description is truncated to 1000 chars."""
        long_desc = "a" * 1500
        data = {
            "title": "Test Event",
            "description": long_desc,
            "date": "2026-08-29",
            "start_time": "10:00:00",
            "end_time": "11:00:00"
        }
        response = self.client.post(self.events_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["description"]), 1000)
        
    def test_date_preserved(self):
        """Test date-only values are preserved without timezone shift."""
        test_dates = ["2026-08-14", "2026-08-29", "2026-08-30", "2026-01-31", "2026-12-31"]
        for test_date in test_dates:
            data = {
                "title": "Date Test",
                "date": test_date,
                "start_time": "09:00:00",
                "end_time": "10:00:00"
            }
            response = self.client.post(self.events_url, data)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertEqual(response.data["date"], test_date)
            
    def test_end_time_must_be_after_start(self):
        """Test end time must be after start time."""
        data = {
            "title": "Invalid Event",
            "date": "2026-08-29",
            "start_time": "11:00:00",
            "end_time": "10:00:00"
        }
        response = self.client.post(self.events_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_time", response.data)
        
    def test_same_day_event_same_time_allowed(self):
        """Test same start and end time is allowed."""
        data = {
            "title": "Same Time Event",
            "date": "2026-08-29",
            "start_time": "10:00:00",
            "end_time": "10:00:00"
        }
        response = self.client.post(self.events_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
    def test_get_events(self):
        """Test getting user's events."""
        CalendarEvent.objects.create(
            user=self.user, title="Event 1", date="2026-08-29",
            start_time="10:00:00", end_time="11:00:00"
        )
        CalendarEvent.objects.create(
            user=self.user, title="Event 2", date="2026-08-30",
            start_time="14:00:00", end_time="15:00:00"
        )
        CalendarEvent.objects.create(
            user=self.user2, title="Other Event", date="2026-08-29",
            start_time="10:00:00", end_time="11:00:00"
        )
        
        response = self.client.get(self.events_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)
        
    def test_update_event(self):
        """Test updating an event."""
        event = CalendarEvent.objects.create(
            user=self.user, title="Old Event", date="2026-08-29",
            start_time="10:00:00", end_time="11:00:00"
        )
        url = f"/api/events/{event.id}/"
        data = {"title": "New Event"}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "New Event")
        
    def test_delete_event(self):
        """Test deleting an event."""
        event = CalendarEvent.objects.create(
            user=self.user, title="To Delete", date="2026-08-29",
            start_time="10:00:00", end_time="11:00:00"
        )
        url = f"/api/events/{event.id}/"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(CalendarEvent.objects.filter(id=event.id).count(), 0)
        
    def test_cannot_access_other_user_event(self):
        """Test user cannot access another user's event."""
        other_event = CalendarEvent.objects.create(
            user=self.user2, title="Other Event", date="2026-08-29",
            start_time="10:00:00", end_time="11:00:00"
        )
        url = f"/api/events/{other_event.id}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class SearchAndFilterTests(TestCase):
    """Test search and filtering capabilities."""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="searchuser",
            email="search@example.com",
            password="securePass-2026x"
        )
        self.user2 = User.objects.create_user(
            username="searchuser2",
            email="search2@example.com",
            password="securePass-2026x"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "search@example.com", "password": "securePass-2026x"}
        )
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        
        # Create test data
        self.list1 = List.objects.create(user=self.user, label="Work Projects", color="blue")
        self.list2 = List.objects.create(user=self.user, label="Personal Tasks", color="coral")
        self.tag1 = Tag.objects.create(user=self.user, label="Urgent", color="coral")
        self.tag2 = Tag.objects.create(user=self.user, label="Low Priority", color="green")
        
        self.task1 = Task.objects.create(
            user=self.user, title="Complete project report",
            description="Finish the quarterly report", list=self.list1
        )
        self.task1.tags.add(self.tag1)
        
        self.task2 = Task.objects.create(
            user=self.user, title="Buy groceries",
            description="Milk, eggs, bread", list=self.list2
        )
        self.task2.tags.add(self.tag2)
        
        self.task3 = Task.objects.create(
            user=self.user, title="Schedule meeting",
            description="Team sync meeting", completed=True
        )
        
        # Other user's data
        Task.objects.create(
            user=self.user2, title="Other user task",
            description="Should not appear in search"
        )
        
    def test_search_by_title(self):
        """Test searching tasks by title."""
        response = self.client.get("/api/tasks/?search=project")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["title"], "Complete project report")
        
    def test_search_by_description(self):
        """Test searching tasks by description."""
        response = self.client.get("/api/tasks/?search=groceries")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        
    def test_search_no_results(self):
        """Test search with no matching results."""
        response = self.client.get("/api/tasks/?search=nonexistent")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 0)
        
    def test_search_isolation(self):
        """Test search only returns user's own tasks."""
        response = self.client.get("/api/tasks/?search=Other")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 0)
        
    def test_filter_by_completed(self):
        """Test filtering by completed status."""
        response = self.client.get("/api/tasks/?completed=true")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertTrue(response.data["results"][0]["completed"])
        
    def test_filter_by_pending(self):
        """Test filtering by pending (not completed) status."""
        response = self.client.get("/api/tasks/?completed=false")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)
        
    def test_filter_by_list(self):
        """Test filtering by list."""
        response = self.client.get(f"/api/tasks/?list={self.list1.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        
    def test_filter_by_tag(self):
        """Test filtering by tag."""
        response = self.client.get(f"/api/tasks/?tags={self.tag1.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)


class UnauthenticatedAccessTests(TestCase):
    """Test that unauthenticated users cannot access protected endpoints."""
    
    def setUp(self):
        self.client = APIClient()
        
    def test_tasks_require_auth(self):
        """Test tasks endpoint requires authentication."""
        response = self.client.get("/api/tasks/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_lists_require_auth(self):
        """Test lists endpoint requires authentication."""
        response = self.client.get("/api/lists/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_tags_require_auth(self):
        """Test tags endpoint requires authentication."""
        response = self.client.get("/api/tags/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_notes_require_auth(self):
        """Test notes endpoint requires authentication."""
        response = self.client.get("/api/notes/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_events_require_auth(self):
        """Test events endpoint requires authentication."""
        response = self.client.get("/api/events/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_user_me_requires_auth(self):
        """Test user/me endpoint requires authentication."""
        response = self.client.get("/api/user/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class DeleteAccountTests(TestCase):
    """Test delete account functionality."""
    
    def setUp(self):
        self.client = APIClient()
        self.register_url = "/api/auth/register/"
        self.user_data = {
            "username": "deleteuser",
            "email": "delete@example.com",
            "password": "securePass-2026x"
        }
        # Register, verify the emailed link, and login
        login_response = register_and_activate(self.client, self.user_data)
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.user = User.objects.get(email="delete@example.com")
        
        # Create some data for the user
        from api.models import List, Tag, Task, Note, CalendarEvent
        from datetime import date, time
        self.test_list = List.objects.create(user=self.user, label="Test List")
        self.test_tag = Tag.objects.create(user=self.user, label="testtag")
        self.test_task = Task.objects.create(user=self.user, title="Test Task")
        self.test_note = Note.objects.create(user=self.user, title="Test Note")
        self.test_event = CalendarEvent.objects.create(
            user=self.user, 
            title="Test Event",
            date=date(2026, 8, 29),
            start_time=time(10, 0),
            end_time=time(11, 0)
        )
        
    def test_delete_account_success(self):
        """Test successful account deletion with correct password."""
        data = {"password": "securePass-2026x"}
        response = self.client.delete("/api/user/account/", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("deleted", response.data.get("message", "").lower())
        
        # Verify user is deleted
        self.assertFalse(User.objects.filter(email="delete@example.com").exists())
        
        # Verify all associated data is deleted (cascade)
        from api.models import List, Tag, Task, Note, CalendarEvent
        self.assertEqual(List.objects.filter(user=self.user).count(), 0)
        self.assertEqual(Tag.objects.filter(user=self.user).count(), 0)
        self.assertEqual(Task.objects.filter(user=self.user).count(), 0)
        self.assertEqual(Note.objects.filter(user=self.user).count(), 0)
        self.assertEqual(CalendarEvent.objects.filter(user=self.user).count(), 0)
        
    def test_delete_account_wrong_password(self):
        """Test account deletion rejected with wrong password."""
        data = {"password": "wrongpassword"}
        response = self.client.delete("/api/user/account/", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("incorrect", response.data.get("error", "").lower())
        
        # Verify user still exists
        self.assertTrue(User.objects.filter(email="delete@example.com").exists())
        
        # Verify all data still exists
        from api.models import List, Tag, Task, Note, CalendarEvent
        self.assertEqual(List.objects.filter(user=self.user).count(), 1)
        self.assertEqual(Tag.objects.filter(user=self.user).count(), 1)
        self.assertEqual(Task.objects.filter(user=self.user).count(), 1)
        self.assertEqual(Note.objects.filter(user=self.user).count(), 1)
        self.assertEqual(CalendarEvent.objects.filter(user=self.user).count(), 1)
        
    def test_delete_account_no_password(self):
        """Test account deletion rejected without password."""
        data = {}
        response = self.client.delete("/api/user/account/", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("required", response.data.get("error", "").lower())
        
        # Verify user still exists
        self.assertTrue(User.objects.filter(email="delete@example.com").exists())
        
    def test_delete_account_unauthenticated(self):
        """Test unauthenticated user cannot delete account."""
        # Clear credentials
        self.client.credentials()
        data = {"password": "securePass-2026x"}
        response = self.client.delete("/api/user/account/", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_delete_account_user_isolation(self):
        """Test deleting one user doesn't affect another user's data."""
        # Create second user with their own client to avoid token conflicts
        from rest_framework.test import APIClient
        client2 = APIClient()
        user2_data = {
            "username": "user2",
            "email": "user2@example.com",
            "password": "securePass-777y"
        }
        user2_login = register_and_activate(client2, user2_data)
        user2_token = user2_login.data["token"]
        client2.credentials(HTTP_AUTHORIZATION=f'Token {user2_token}')
        user2 = User.objects.get(email="user2@example.com")
        
        # Create data for user2 using client2
        from api.models import List, Tag, Task, Note, CalendarEvent
        from datetime import date, time
        user2_list = List.objects.create(user=user2, label="User2 List")
        user2_tag = Tag.objects.create(user=user2, label="user2tag")
        user2_task = Task.objects.create(user=user2, title="User2 Task")
        user2_note = Note.objects.create(user=user2, title="User2 Note")
        user2_event = CalendarEvent.objects.create(
            user=user2,
            title="User2 Event",
            date=date(2026, 8, 30),
            start_time=time(14, 0),
            end_time=time(15, 0)
        )
        
        # Delete first user using original client
        data = {"password": "securePass-2026x"}
        response = self.client.delete("/api/user/account/", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify user2's data is intact
        self.assertTrue(User.objects.filter(email="user2@example.com").exists())
        self.assertEqual(List.objects.filter(user=user2).count(), 1)
        self.assertEqual(Tag.objects.filter(user=user2).count(), 1)
        self.assertEqual(Task.objects.filter(user=user2).count(), 1)
        self.assertEqual(Note.objects.filter(user=user2).count(), 1)
        self.assertEqual(CalendarEvent.objects.filter(user=user2).count(), 1)


class NotificationTests(TestCase):
    """Test notification persistence and deduplication."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="notifyuser",
            email="notify@example.com",
            password="securePass-2026x"
        )
        self.user2 = User.objects.create_user(
            username="notifyuser2",
            email="notify2@example.com",
            password="securePass-2026x"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "notify@example.com", "password": "securePass-2026x"}
        )
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.notifications_url = "/api/notifications/"

    def test_create_notification(self):
        """Test creating a notification persists it."""
        data = {
            "message": "Hi, John You Finished This Task: Finish my project.",
            "dedup_key": "task-completed:abc:2026-08-20T10:00:00Z"
        }
        response = self.client.post(self.notifications_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], data["message"])
        self.assertEqual(response.data["read"], False)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

    def test_duplicate_dedup_key_does_not_create_second_notification(self):
        """Test re-submitting the same dedup_key returns the stored notification."""
        data = {
            "message": "Tomorrow at 12:00 PM: Finish my project. Don't forget!",
            "dedup_key": "day-before:event:abc:2026-08-21"
        }
        first = self.client.post(self.notifications_url, data)
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(self.notifications_url, data)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

    def test_same_dedup_key_allowed_for_different_users(self):
        """Test dedup_key uniqueness is scoped per user."""
        Notification.objects.create(
            user=self.user2,
            message="Other user notification",
            dedup_key="due-time:task:abc:2026-08-20"
        )
        data = {
            "message": "It's time for: Finish my project. Don't forget!",
            "dedup_key": "due-time:task:abc:2026-08-20"
        }
        response = self.client.post(self.notifications_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Notification.objects.count(), 2)

    def test_list_notifications_only_own(self):
        """Test users only see their own notifications."""
        Notification.objects.create(
            user=self.user, message="Own notification", dedup_key="k1"
        )
        Notification.objects.create(
            user=self.user2, message="Other notification", dedup_key="k2"
        )
        response = self.client.get(self.notifications_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["message"], "Own notification")

    def test_cannot_delete_other_user_notification(self):
        """Test user cannot delete another user's notification."""
        other = Notification.objects.create(
            user=self.user2, message="Other notification", dedup_key="k3"
        )
        response = self.client.delete(f"/api/notifications/{other.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Notification.objects.filter(id=other.id).count(), 1)

    def test_notification_requires_auth(self):
        """Test unauthenticated requests are rejected."""
        self.client.credentials()
        response = self.client.get(self.notifications_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_new_user_notification_settings_default_on(self):
        """Test both notification settings default to ON for new users."""
        client = APIClient()
        response = client.post(
            "/api/auth/register/",
            {
                "username": "defaults@example.com",
                "email": "defaults@example.com",
                "password": "securePass-2026x",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["user"]["push_notifications"], True)
        self.assertEqual(response.data["user"]["task_reminders"], True)

    def test_clear_notifications_deletes_all_own(self):
        """Test clearing removes every notification belonging to the user."""
        Notification.objects.create(user=self.user, message="One", dedup_key="clear-1")
        Notification.objects.create(user=self.user, message="Two", dedup_key="clear-2")
        response = self.client.delete("/api/notifications/clear/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["deleted"], 2)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)

    def test_clear_notifications_keeps_other_users(self):
        """Test clearing only affects the requesting user's notifications."""
        Notification.objects.create(user=self.user, message="Own", dedup_key="clear-3")
        Notification.objects.create(user=self.user2, message="Other", dedup_key="clear-4")
        response = self.client.delete("/api/notifications/clear/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)
        self.assertEqual(Notification.objects.filter(user=self.user2).count(), 1)

    def test_clear_notifications_requires_auth(self):
        """Test unauthenticated clear is rejected."""
        Notification.objects.create(user=self.user, message="Own", dedup_key="clear-5")
        self.client.credentials()
        response = self.client.delete("/api/notifications/clear/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

    def test_mark_notification_read(self):
        """Test PATCH marks a notification as read."""
        notification = Notification.objects.create(
            user=self.user, message="Unread", dedup_key="read-1"
        )
        response = self.client.patch(
            f"/api/notifications/{notification.id}/",
            {"read": True},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["read"], True)
        notification.refresh_from_db()
        self.assertTrue(notification.read)

    def test_cannot_mark_other_user_notification_read(self):
        """Test users cannot mark another user's notification as read."""
        other = Notification.objects.create(
            user=self.user2, message="Other notification", dedup_key="read-2"
        )
        response = self.client.patch(
            f"/api/notifications/{other.id}/",
            {"read": True},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        other.refresh_from_db()
        self.assertFalse(other.read)

    def test_mark_all_read_marks_own_unread_notifications(self):
        """Test the bulk endpoint marks only the requester's unread items."""
        Notification.objects.create(user=self.user, message="One", dedup_key="mar-1")
        Notification.objects.create(user=self.user, message="Two", dedup_key="mar-2")
        Notification.objects.create(
            user=self.user, message="Already read", dedup_key="mar-3", read=True
        )
        Notification.objects.create(user=self.user2, message="Other", dedup_key="mar-4")

        response = self.client.post("/api/notifications/mark_all_read/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 2)
        self.assertEqual(
            Notification.objects.filter(user=self.user, read=False).count(), 0
        )
        # The other user's notification is untouched.
        self.assertFalse(Notification.objects.get(dedup_key="mar-4").read)

    def test_mark_all_read_requires_auth(self):
        """Test unauthenticated bulk mark-read is rejected."""
        Notification.objects.create(user=self.user, message="One", dedup_key="mar-5")
        self.client.credentials()
        response = self.client.post("/api/notifications/mark_all_read/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(Notification.objects.get(dedup_key="mar-5").read)

    def test_create_notification_broadcasts_over_websocket(self):
        """Test creating a notification pushes it to the user's WS group."""
        with mock.patch("api.views.channel_layer") as mock_layer:
            mock_layer.group_send = mock.AsyncMock()
            data = {"message": "Broadcast me", "dedup_key": "ws-broadcast-1"}
            response = self.client.post(self.notifications_url, data)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

            mock_layer.group_send.assert_awaited_once()
            group, payload = mock_layer.group_send.call_args.args
            self.assertEqual(group, f"user_{self.user.id}_notifications")
            self.assertEqual(payload["type"], "send_notification")
            self.assertEqual(payload["data"]["type"], "notification_created")
            self.assertEqual(payload["data"]["object"]["message"], "Broadcast me")
            self.assertEqual(payload["data"]["object"]["read"], False)

    def test_duplicate_dedup_key_does_not_broadcast_again(self):
        """Test an idempotent re-POST returns the stored item without a broadcast."""
        data = {"message": "Once only", "dedup_key": "ws-broadcast-2"}
        self.client.post(self.notifications_url, data)

        with mock.patch("api.views.channel_layer") as mock_layer:
            mock_layer.group_send = mock.AsyncMock()
            response = self.client.post(self.notifications_url, data)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            mock_layer.group_send.assert_not_awaited()


class WebSocketTests(TestCase):
    """Test the real-time notification WebSocket endpoint.

    Every connection passes an Origin header taken from the dev CORS
    allow-list so the tests exercise ticket authentication instead of being
    rejected up front by the origin validator (which closes connections with
    no or disallowed Origin).
    """

    ORIGIN_HEADERS = [(b"origin", b"http://localhost:5173")]

    async def test_anonymous_connection_is_rejected(self):
        """Test connections without a ticket are closed."""
        communicator = WebsocketCommunicator(
            application, "/ws/notifications/", headers=self.ORIGIN_HEADERS
        )
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_invalid_ticket_connection_is_rejected(self):
        """Test connections with a garbage ticket are closed."""
        communicator = WebsocketCommunicator(
            application, "/ws/notifications/?ticket=not-a-real-ticket",
            headers=self.ORIGIN_HEADERS,
        )
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_raw_api_token_in_query_string_is_rejected(self):
        """Test the legacy ?token= path no longer authenticates the socket.

        Long-lived tokens must not be usable in the WebSocket URL because
        query strings leak into server/proxy logs.
        """
        user = await database_sync_to_async(User.objects.create_user)(
            username="tokenuser", email="token@example.com", password="securePass-2026x"
        )
        token = await database_sync_to_async(Token.objects.create)(user=user)
        communicator = WebsocketCommunicator(
            application, f"/ws/notifications/?token={token.key}",
            headers=self.ORIGIN_HEADERS,
        )
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_valid_ticket_connects_and_receives_broadcast(self):
        """Test ticket-authenticated connections join the user's group."""
        from api.middleware import generate_ws_ticket

        user = await database_sync_to_async(User.objects.create_user)(
            username="wsuser", email="ws@example.com", password="securePass-2026x"
        )
        ticket = await database_sync_to_async(generate_ws_ticket)(user)

        communicator = WebsocketCommunicator(
            application, f"/ws/notifications/?ticket={ticket}",
            headers=self.ORIGIN_HEADERS,
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        welcome = await communicator.receive_json_from()
        self.assertEqual(welcome["type"], "connection_established")

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"user_{user.id}_notifications",
            {
                "type": "send_notification",
                "data": {"message": "List created", "type": "list_created"},
            },
        )
        message = await communicator.receive_json_from()
        self.assertEqual(message["type"], "notification")
        self.assertEqual(message["data"]["message"], "List created")

        await communicator.disconnect()

    async def test_ticket_cannot_be_reused(self):
        """Test a ticket authenticates only one connection (replay protection).

        Within the ticket's lifetime a leaked ticket must not be replayable:
        the nonce embedded in the ticket is consumed on first redemption.
        """
        from api.middleware import generate_ws_ticket

        user = await database_sync_to_async(User.objects.create_user)(
            username="replayuser", email="replay@example.com", password="securePass-2026x"
        )
        ticket = await database_sync_to_async(generate_ws_ticket)(user)

        first = WebsocketCommunicator(
            application, f"/ws/notifications/?ticket={ticket}",
            headers=self.ORIGIN_HEADERS,
        )
        connected, _ = await first.connect()
        self.assertTrue(connected)

        second = WebsocketCommunicator(
            application, f"/ws/notifications/?ticket={ticket}",
            headers=self.ORIGIN_HEADERS,
        )
        connected, _ = await second.connect()
        self.assertFalse(connected)

        await first.disconnect()
        await second.disconnect()

    async def test_ticket_without_nonce_is_rejected(self):
        """Test a ticket missing the single-use nonce cannot authenticate."""
        from django.core import signing
        from api.middleware import WS_TICKET_SALT

        user = await database_sync_to_async(User.objects.create_user)(
            username="nonceless", email="nonceless@example.com", password="securePass-2026x"
        )
        ticket = await database_sync_to_async(signing.dumps)(
            {"user_id": str(user.pk)}, salt=WS_TICKET_SALT
        )
        communicator = WebsocketCommunicator(
            application, f"/ws/notifications/?ticket={ticket}",
            headers=self.ORIGIN_HEADERS,
        )
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_disallowed_origin_is_rejected(self):
        """Test connections from origins outside the CORS allow-list are closed."""
        from api.middleware import generate_ws_ticket

        user = await database_sync_to_async(User.objects.create_user)(
            username="originuser", email="origin@example.com", password="securePass-2026x"
        )
        ticket = await database_sync_to_async(generate_ws_ticket)(user)
        communicator = WebsocketCommunicator(
            application, f"/ws/notifications/?ticket={ticket}",
            headers=[(b"origin", b"http://evil.example.com")],
        )
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()


class HealthCheckTests(TestCase):
    """Test the unauthenticated health-check endpoint."""

    def test_health_check_returns_ok(self):
        """Test the health endpoint returns 200 and reports a reachable DB."""
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertTrue(body["database"])

    def test_health_check_requires_no_authentication(self):
        """Test the health endpoint is reachable without credentials."""
        # No credentials are set on the client.
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_health_check_rejects_non_get(self):
        """Test non-GET methods are rejected with 405."""
        response = self.client.post("/api/health/")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class TaskCompletionSignalTests(TestCase):
    """Test server-side completion notification generation via signals."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="signaluser",
            email="signal@example.com",
            password="securePass-2026x",
            first_name="Signal",
            last_name="User",
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "signal@example.com", "password": "securePass-2026x"}
        )
        self.token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')

    def test_completing_task_creates_notification(self):
        """Test toggling a task to completed creates a notification."""
        task = Task.objects.create(user=self.user, title="My Task", completed=False)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)

        response = self.client.post(f"/api/tasks/{task.id}/toggle/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["completed"])

        notifications = Notification.objects.filter(user=self.user)
        self.assertEqual(notifications.count(), 1)
        notification = notifications.first()
        self.assertEqual(notification.dedup_key, f"task-completed:{task.id}")
        self.assertEqual(
            notification.message,
            "Hi, Signal User You Finished This Task: My Task."
        )

    def test_uncompleting_task_does_not_create_notification(self):
        """Test toggling a completed task back to open creates nothing."""
        task = Task.objects.create(user=self.user, title="My Task", completed=True)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)

        response = self.client.post(f"/api/tasks/{task.id}/toggle/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["completed"])

        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)

    def test_recompleting_task_does_not_duplicate_notification(self):
        """Test complete -> un-complete -> re-complete yields one notification."""
        task = Task.objects.create(user=self.user, title="My Task", completed=False)

        self.client.post(f"/api/tasks/{task.id}/toggle/")  # complete
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

        self.client.post(f"/api/tasks/{task.id}/toggle/")  # un-complete
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

        self.client.post(f"/api/tasks/{task.id}/toggle/")  # re-complete
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

    def test_no_notification_when_push_notifications_disabled(self):
        """Test no notification is created when push notifications are off."""
        self.user.push_notifications = False
        self.user.save()
        task = Task.objects.create(user=self.user, title="My Task", completed=False)

        self.client.post(f"/api/tasks/{task.id}/toggle/")
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)

    def test_client_post_with_same_dedup_key_returns_server_notification(self):
        """Test the client and server dedup keys agree, preventing duplicates."""
        task = Task.objects.create(user=self.user, title="My Task", completed=False)
        self.client.post(f"/api/tasks/{task.id}/toggle/")
        server_notification = Notification.objects.get(user=self.user)

        response = self.client.post(
            "/api/notifications/",
            {
                "message": "Hi, Signal User You Finished This Task: My Task.",
                "dedup_key": f"task-completed:{task.id}"
            }
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(server_notification.id))
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)

    def test_completing_task_broadcasts_notification_over_websocket(self):
        """Test the server-generated completion notification reaches the WS group."""
        task = Task.objects.create(user=self.user, title="My Task", completed=False)

        with mock.patch("api.signals.get_channel_layer") as mock_get:
            mock_layer = mock.Mock()
            mock_layer.group_send = mock.AsyncMock()
            mock_get.return_value = mock_layer

            response = self.client.post(f"/api/tasks/{task.id}/toggle/")
            self.assertEqual(response.status_code, status.HTTP_200_OK)

            mock_layer.group_send.assert_awaited_once()
            group, payload = mock_layer.group_send.call_args.args
            self.assertEqual(group, f"user_{self.user.id}_notifications")
            self.assertEqual(payload["data"]["type"], "notification_created")
            self.assertEqual(
                payload["data"]["object"]["dedup_key"],
                f"task-completed:{task.id}"
            )

    def test_recompleting_task_does_not_broadcast_again(self):
        """Test no broadcast fires when the notification already exists."""
        task = Task.objects.create(user=self.user, title="My Task", completed=False)
        self.client.post(f"/api/tasks/{task.id}/toggle/")  # complete
        self.client.post(f"/api/tasks/{task.id}/toggle/")  # un-complete

        with mock.patch("api.signals.get_channel_layer") as mock_get:
            mock_layer = mock.Mock()
            mock_layer.group_send = mock.AsyncMock()
            mock_get.return_value = mock_layer

            self.client.post(f"/api/tasks/{task.id}/toggle/")  # re-complete
            mock_layer.group_send.assert_not_awaited()

    def test_raw_save_does_not_create_notification_or_broadcast(self):
        """Test a raw save (what loaddata does) flipping completed stays silent.

        Without the ``raw`` guard, deserializing a fixture over an existing
        open task would generate a notification and a WebSocket broadcast even
        though no user action happened.
        """
        task = Task.objects.create(user=self.user, title="Fixture Task", completed=False)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)

        with mock.patch("api.signals.get_channel_layer") as mock_get:
            mock_layer = mock.Mock()
            mock_layer.group_send = mock.AsyncMock()
            mock_get.return_value = mock_layer

            # save_base(raw=True) is exactly how loaddata persists rows.
            task.completed = True
            task.save_base(raw=True)

            mock_layer.group_send.assert_not_awaited()

        task.refresh_from_db()
        self.assertTrue(task.completed)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)


class UserRouteRestrictionTests(TestCase):
    """Test UserViewSet exposes only its custom actions.

    A full ModelViewSet routed DELETE /api/user/{id}/ (account deletion with
    no password check) and POST /api/user/ (a broken create); those default
    routes must not exist.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="routeuser",
            email="route@example.com",
            password="securePass-2026x",
        )
        self.attacker = User.objects.create_user(
            username="attacker",
            email="attacker@example.com",
            password="securePass-2026x",
        )
        token = Token.objects.create(user=self.attacker)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_delete_user_by_id_is_not_routed(self):
        """Test a stolen token cannot wipe an account via DELETE /api/user/{id}/."""
        response = self.client.delete(f"/api/user/{self.user.id}/")
        self.assertIn(response.status_code, (
            status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED
        ))
        self.assertTrue(User.objects.filter(id=self.user.id).exists())

    def test_create_user_is_not_routed(self):
        """Test POST /api/user/ no longer exists."""
        response = self.client.post(
            "/api/user/",
            {"username": "sneaky", "email": "sneaky@example.com"},
        )
        self.assertIn(response.status_code, (
            status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED
        ))
        self.assertFalse(User.objects.filter(username="sneaky").exists())

    def test_list_users_is_not_routed(self):
        """Test GET /api/user/ does not enumerate users."""
        response = self.client.get("/api/user/")
        self.assertIn(response.status_code, (
            status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED
        ))

    def test_retrieve_user_by_id_is_not_routed(self):
        """Test GET /api/user/{id}/ does not leak profiles."""
        response = self.client.get(f"/api/user/{self.user.id}/")
        self.assertIn(response.status_code, (
            status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED
        ))


class TokenSecurityTests(TestCase):
    """Test API token expiry and WebSocket ticket issuance."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="tokenuser2",
            email="token2@example.com",
            password="securePass-2026x",
        )

    def test_expired_token_is_rejected(self):
        """Test tokens older than TOKEN_EXPIRY_DAYS no longer authenticate."""
        from datetime import timedelta
        from django.utils import timezone
        from django.conf import settings

        token = Token.objects.create(user=self.user)
        # Age the token beyond the expiry window.
        Token.objects.filter(pk=token.pk).update(
            created=timezone.now() - timedelta(days=settings.TOKEN_EXPIRY_DAYS + 1)
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get("/api/user/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_fresh_token_is_accepted(self):
        """Test a token inside the expiry window still works."""
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get("/api/user/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_login_rotates_token(self):
        """Test each login issues a fresh token and invalidates the old one.

        Rotation means a stolen token stops working as soon as the real
        owner signs in again.
        """
        login_data = {"email": "token2@example.com", "password": "securePass-2026x"}
        first = self.client.post("/api/auth/login/", login_data)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        first_token = first.data["token"]

        second = self.client.post("/api/auth/login/", login_data)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        second_token = second.data["token"]
        self.assertNotEqual(first_token, second_token)

        # The rotated-out token must no longer authenticate.
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {first_token}')
        response = self.client.get("/api/user/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # The fresh token works.
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {second_token}')
        response = self.client.get("/api/user/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_ws_ticket_requires_authentication(self):
        """Test the ticket endpoint rejects anonymous callers."""
        response = self.client.post("/api/auth/ws_ticket/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_ws_ticket_is_short_lived_and_valid(self):
        """Test the issued ticket authenticates a socket but expires quickly."""
        from django.core import signing
        from api.middleware import WS_TICKET_SALT

        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.post("/api/auth/ws_ticket/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket = response.data["ticket"]
        # The long-lived API token must not appear in the ticket.
        self.assertNotIn(token.key, ticket)

        payload = signing.loads(ticket, salt=WS_TICKET_SALT, max_age=60)
        self.assertEqual(payload["user_id"], str(self.user.id))
        # Single-use: every ticket carries a random nonce consumed on
        # first redemption.
        self.assertTrue(payload.get("nonce"))

        # The same ticket is rejected once it is older than the max age.
        with self.assertRaises(signing.BadSignature):
            signing.loads(ticket, salt=WS_TICKET_SALT, max_age=0)

    def test_ws_tickets_carry_a_fresh_nonce_each_time(self):
        """Test two tickets for the same user are never identical."""
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        first = self.client.post("/api/auth/ws_ticket/")
        second = self.client.post("/api/auth/ws_ticket/")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertNotEqual(first.data["ticket"], second.data["ticket"])


class SeedE2eUserCommandTests(TestCase):
    """Test the seed_e2e_user management command's production guard.

    The command deletes any matching user (CASCADE wiping their data) and
    creates an account with known credentials, so it must refuse to run
    against a production database (DEBUG off) unless explicitly forced.
    """

    def _run(self, **kwargs):
        from django.core.management import call_command
        from io import StringIO
        out = StringIO()
        call_command("seed_e2e_user", stdout=out, **kwargs)
        return out

    def test_refuses_when_debug_off_without_force(self):
        from django.core.management import CommandError
        with self.settings(DEBUG=False):
            with self.assertRaises(CommandError):
                self._run()
        self.assertFalse(
            User.objects.filter(email="e2e@organicmind.local").exists()
        )

    def test_force_overrides_debug_off(self):
        with self.settings(DEBUG=False):
            self._run(force=True)
        user = User.objects.get(email="e2e@organicmind.local")
        self.assertTrue(user.is_active)

    def test_runs_when_debug_on(self):
        with self.settings(DEBUG=True):
            self._run()
        self.assertTrue(
            User.objects.filter(email="e2e@organicmind.local").exists()
        )

    def test_reset_deletes_previous_user_data(self):
        """Test re-seeding clears the previous e2e user's data via CASCADE."""
        with self.settings(DEBUG=True):
            self._run()
            user = User.objects.get(email="e2e@organicmind.local")
            Task.objects.create(user=user, title="Leftover")
            self.assertEqual(Task.objects.filter(user=user).count(), 1)

            self._run()
            new_user = User.objects.get(email="e2e@organicmind.local")
            self.assertNotEqual(user.id, new_user.id)
            self.assertEqual(Task.objects.filter(user=new_user).count(), 0)


class DatabaseUrlParserTests(TestCase):
    """Test the DJANGO_DATABASE_URL parsing helper in settings."""

    def parse(self, url):
        from organic_mind_backend.settings import database_config_from_url
        return database_config_from_url(url)

    def test_postgres_url_is_parsed(self):
        config = self.parse(
            "postgres://user:s%40cret@db.example.com:5432/organic_mind"
            "?sslmode=require"
        )
        self.assertEqual(config["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(config["NAME"], "organic_mind")
        self.assertEqual(config["USER"], "user")
        self.assertEqual(config["PASSWORD"], "s@cret")
        self.assertEqual(config["HOST"], "db.example.com")
        self.assertEqual(config["PORT"], "5432")
        self.assertEqual(config["OPTIONS"], {"sslmode": "require"})

    def test_postgresql_scheme_alias(self):
        config = self.parse("postgresql://user@localhost/app")
        self.assertEqual(config["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(config["HOST"], "localhost")
        self.assertEqual(config["PORT"], "")

    def test_sqlite_relative_and_absolute_paths(self):
        relative = self.parse("sqlite:///db.sqlite3")
        self.assertEqual(relative["ENGINE"], "django.db.backends.sqlite3")
        self.assertEqual(relative["NAME"], "db.sqlite3")

        absolute = self.parse("sqlite:////var/data/db.sqlite3")
        self.assertEqual(absolute["NAME"], "/var/data/db.sqlite3")

        memory = self.parse("sqlite://:memory:")
        self.assertEqual(memory["NAME"], ":memory:")

    def test_unsupported_scheme_is_rejected(self):
        from django.core.exceptions import ImproperlyConfigured
        with self.assertRaises(ImproperlyConfigured):
            self.parse("oracle://user@host/db")


class SettingsGuardTests(TestCase):
    """Test the production guards in settings.py.

    The guards raise ImproperlyConfigured at settings-module import time, so
    each scenario runs in a subprocess with a controlled environment instead
    of mutating the live settings of the test process.
    """

    GUARDED_VARS = (
        "DJANGO_DEBUG",
        "DJANGO_SECRET_KEY",
        "DJANGO_ALLOWED_HOSTS",
        "DJANGO_CORS_ORIGINS",
        "DJANGO_EMAIL_BACKEND",
        "DJANGO_DATABASE_URL",
    )

    # A complete, valid production environment; individual tests drop one
    # variable from it and expect a loud startup failure.
    PRODUCTION_ENV = {
        "DJANGO_DEBUG": "False",
        "DJANGO_SECRET_KEY": "test-production-secret-key",
        "DJANGO_ALLOWED_HOSTS": "api.example.com",
        "DJANGO_CORS_ORIGINS": "https://app.example.com",
        "DJANGO_EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "DJANGO_DATABASE_URL": "postgres://user:pass@db.example.com:5432/app",
    }

    def import_settings(self, env_overrides):
        from pathlib import Path
        project_root = Path(__file__).resolve().parent.parent
        env = {
            key: value for key, value in os.environ.items()
            if key not in self.GUARDED_VARS
        }
        env.update(env_overrides)
        return subprocess.run(
            [sys.executable, "-c", "import organic_mind_backend.settings"],
            capture_output=True,
            text=True,
            env=env,
            cwd=str(project_root),
        )

    def test_production_environment_imports_cleanly(self):
        result = self.import_settings(self.PRODUCTION_ENV)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_email_backend_refuses_to_start(self):
        env = {k: v for k, v in self.PRODUCTION_ENV.items()
               if k != "DJANGO_EMAIL_BACKEND"}
        result = self.import_settings(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ImproperlyConfigured", result.stderr)
        self.assertIn("DJANGO_EMAIL_BACKEND", result.stderr)

    def test_missing_cors_origins_refuses_to_start(self):
        env = {k: v for k, v in self.PRODUCTION_ENV.items()
               if k != "DJANGO_CORS_ORIGINS"}
        result = self.import_settings(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ImproperlyConfigured", result.stderr)
        self.assertIn("DJANGO_CORS_ORIGINS", result.stderr)

    def test_missing_database_url_refuses_to_start(self):
        env = {k: v for k, v in self.PRODUCTION_ENV.items()
               if k != "DJANGO_DATABASE_URL"}
        result = self.import_settings(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ImproperlyConfigured", result.stderr)
        self.assertIn("DJANGO_DATABASE_URL", result.stderr)

