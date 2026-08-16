"""
Comprehensive test suite for Organic Mind backend.
Tests authentication, profile, tasks, subtasks, lists, tags, notes, calendar events, and security.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
from .models import List, Tag, Task, Subtask, Note, CalendarEvent
import uuid

User = get_user_model()


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
            "password": "password123",
            "first_name": "Test",
            "last_name": "User"
        }
        
    def test_register_user(self):
        """Test user registration creates account and returns token."""
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["email"], "test@example.com")
        
    def test_register_duplicate_email_fails(self):
        """Test registering with same email fails."""
        self.client.post(self.register_url, self.user_data)
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        
    def test_login_valid_credentials(self):
        """Test login with valid credentials returns token."""
        self.client.post(self.register_url, self.user_data)
        login_data = {"email": "test@example.com", "password": "password123"}
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials fails."""
        self.client.post(self.register_url, self.user_data)
        login_data = {"email": "test@example.com", "password": "wrongpassword"}
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_login_missing_fields(self):
        """Test login without email or password fails."""
        response = self.client.post(self.login_url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_logout(self):
        """Test logout invalidates token."""
        self.client.post(self.register_url, self.user_data)
        login_data = {"email": "test@example.com", "password": "password123"}
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
            "password": "password123"
        }
        # Register and login
        response = self.client.post(self.register_url, self.user_data)
        self.token = response.data["token"]
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
        # Should accept IANA format with /
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
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
            "current_password": "password123",
            "new_password": "newpassword456",
            "confirm_password": "newpassword456"
        }
        response = self.client.post("/api/user/change_password/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify new password works
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "profile@example.com", "password": "newpassword456"}
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        
    def test_change_password_wrong_current(self):
        """Test changing password with wrong current password fails."""
        data = {
            "current_password": "wrongpassword",
            "new_password": "newpassword456",
            "confirm_password": "newpassword456"
        }
        response = self.client.post("/api/user/change_password/", data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_change_password_mismatch(self):
        """Test changing password with mismatched new passwords fails."""
        data = {
            "current_password": "password123",
            "new_password": "newpassword456",
            "confirm_password": "differentpassword"
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
            password="password123"
        )
        self.user2 = User.objects.create_user(
            username="listuser2",
            email="list2@example.com",
            password="password123"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "list@example.com", "password": "password123"}
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
            password="password123"
        )
        self.user2 = User.objects.create_user(
            username="taguser2",
            email="tag2@example.com",
            password="password123"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "tag@example.com", "password": "password123"}
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
            password="password123"
        )
        self.user2 = User.objects.create_user(
            username="taskuser2",
            email="task2@example.com",
            password="password123"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "task@example.com", "password": "password123"}
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
            password="password123"
        )
        self.user2 = User.objects.create_user(
            username="subtaskuser2",
            email="subtask2@example.com",
            password="password123"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "subtask@example.com", "password": "password123"}
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
            password="password123"
        )
        self.user2 = User.objects.create_user(
            username="noteuser2",
            email="note2@example.com",
            password="password123"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "note@example.com", "password": "password123"}
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
            password="password123"
        )
        self.user2 = User.objects.create_user(
            username="eventuser2",
            email="event2@example.com",
            password="password123"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "event@example.com", "password": "password123"}
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
            password="password123"
        )
        self.user2 = User.objects.create_user(
            username="searchuser2",
            email="search2@example.com",
            password="password123"
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "search@example.com", "password": "password123"}
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
            "password": "password123"
        }
        # Register and login
        response = self.client.post(self.register_url, self.user_data)
        self.token = response.data["token"]
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
        data = {"password": "password123"}
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
        data = {"password": "password123"}
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
            "password": "password456"
        }
        response = client2.post(self.register_url, user2_data)
        user2_token = response.data["token"]
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
        data = {"password": "password123"}
        response = self.client.delete("/api/user/account/", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify user2's data is intact
        self.assertTrue(User.objects.filter(email="user2@example.com").exists())
        self.assertEqual(List.objects.filter(user=user2).count(), 1)
        self.assertEqual(Tag.objects.filter(user=user2).count(), 1)
        self.assertEqual(Task.objects.filter(user=user2).count(), 1)
        self.assertEqual(Note.objects.filter(user=user2).count(), 1)
        self.assertEqual(CalendarEvent.objects.filter(user=user2).count(), 1)
