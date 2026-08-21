"""
Django models for Organic Mind backend.
Mirrors the frontend TypeScript types from src/types/index.ts
"""
from django.db import models
from django.contrib.auth.models import AbstractUser
import uuid


class User(AbstractUser):
    """Custom user model with profile fields."""
    bio = models.TextField(blank=True, max_length=10000)
    timezone = models.CharField(max_length=50, default='UTC')
    date_format = models.CharField(max_length=20, default='DD-MM-YY')
    start_of_week = models.CharField(max_length=10, default='Monday')
    time_format = models.CharField(max_length=10, default='12-hour')
    push_notifications = models.BooleanField(default=True)
    task_reminders = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'users'
        # Email must be unique for login purposes
        constraints = [
            models.UniqueConstraint(fields=['email'], name='unique_email')
        ]
    
    def __str__(self):
        return self.email


class List(models.Model):
    """Task list/category."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    COLOR_CHOICES = [
        ('coral', 'Coral'),
        ('cyan', 'Cyan'),
        ('yellow', 'Yellow'),
        ('green', 'Green'),
        ('blue', 'Blue'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='lists')
    label = models.CharField(max_length=60)
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default='coral')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'lists'
        ordering = ['created_at']
    
    def __str__(self):
        return self.label


class Tag(models.Model):
    """Task tag."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    COLOR_CHOICES = [
        ('coral', 'Coral'),
        ('cyan', 'Cyan'),
        ('yellow', 'Yellow'),
        ('green', 'Green'),
        ('blue', 'Blue'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tags')
    label = models.CharField(max_length=40)
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default='cyan')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'tags'
        ordering = ['created_at']
    
    def __str__(self):
        return self.label


class Task(models.Model):
    """Main task entity."""
    PRIORITY_CHOICES = [
        ('Low', 'Low'),
        ('Normal', 'Normal'),
        ('High', 'High'),
    ]
    
    COLOR_CHOICES = [
        ('coral', 'Coral'),
        ('cyan', 'Cyan'),
        ('yellow', 'Yellow'),
        ('green', 'Green'),
        ('blue', 'Blue'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True, max_length=2000)
    completed = models.BooleanField(default=False)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='Normal')
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, blank=True, null=True)
    due_date = models.DateField(null=True, blank=True)
    list = models.ForeignKey(List, on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    tags = models.ManyToManyField(Tag, blank=True, related_name='tasks')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'tasks'
        ordering = ['-created_at']
    
    def __str__(self):
        return self.title


class Subtask(models.Model):
    """Subtask belonging to a task."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='subtasks')
    title = models.CharField(max_length=200)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'subtasks'
        ordering = ['created_at']
    
    def __str__(self):
        return self.title


class Note(models.Model):
    """Sticky note."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    COLOR_CHOICES = [
        ('note-yellow', 'Yellow'),
        ('note-cyan', 'Cyan'),
        ('note-coral', 'Coral'),
        ('note-green', 'Green'),
        ('note-blue', 'Blue'),
        ('note-pink', 'Pink'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notes')
    title = models.CharField(max_length=100, default='Untitled')
    body = models.TextField(blank=True, max_length=2000)
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default='note-yellow')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'notes'
        ordering = ['-updated_at']
    
    def __str__(self):
        return self.title


class CalendarEvent(models.Model):
    """Calendar event."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    COLOR_CHOICES = [
        ('coral', 'Coral'),
        ('cyan', 'Cyan'),
        ('yellow', 'Yellow'),
        ('green', 'Green'),
        ('blue', 'Blue'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='events')
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True, max_length=1000)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default='cyan')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'calendar_events'
        ordering = ['date', 'start_time']

    def __str__(self):
        return f"{self.title} ({self.date})"


class Notification(models.Model):
    """Persisted user notification.

    dedup_key guarantees a given notification event (task completed,
    day-before reminder, due-time reminder) is stored at most once per user.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    message = models.CharField(max_length=500)
    dedup_key = models.CharField(max_length=200)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'dedup_key'],
                name='unique_notification_user_dedup_key'
            )
        ]

    def __str__(self):
        return self.message[:50]
