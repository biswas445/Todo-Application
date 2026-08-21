"""
Django admin configuration for Organic Mind.
Provides useful list displays and search/filtering for all models.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import User, List, Tag, Task, Subtask, Note, CalendarEvent, Notification


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Subclass the auth ``UserAdmin`` so passwords are never shown or edited raw.

    The previous ``ModelAdmin`` rendered the password hash as a plain editable
    field; typing a new value there stored it verbatim and corrupted the hash.
    ``UserAdmin`` renders a read-only hash plus a proper password-reset form
    that hashes whatever is entered.
    """
    list_display = ['username', 'email', 'first_name', 'last_name', 'timezone', 'date_joined']
    list_filter = ['timezone', 'date_format', 'start_of_week', 'time_format', 'is_active', 'is_staff', 'is_superuser']
    search_fields = ['username', 'email', 'first_name', 'last_name']

    # Reuse the stock fieldsets (they render ``password`` through
    # ReadOnlyPasswordHashField) and append this app's profile/settings fields.
    fieldsets = DjangoUserAdmin.fieldsets + (
        ('Profile', {'fields': ('bio',)}),
        ('Preferences', {'fields': ('timezone', 'date_format', 'start_of_week', 'time_format')}),
        ('Notifications', {'fields': ('push_notifications', 'task_reminders')}),
    )


@admin.register(List)
class ListAdmin(admin.ModelAdmin):
    list_display = ['label', 'color', 'user', 'created_at', 'updated_at']
    list_filter = ['color', 'user']
    search_fields = ['label', 'user__username', 'user__email']
    raw_id_fields = ['user']


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ['label', 'color', 'user', 'created_at', 'updated_at']
    list_filter = ['color', 'user']
    search_fields = ['label', 'user__username', 'user__email']
    raw_id_fields = ['user']


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'completed', 'priority', 'due_date', 'list', 'created_at']
    list_filter = ['completed', 'priority', 'due_date', 'list', 'user']
    search_fields = ['title', 'description', 'user__username', 'user__email']
    raw_id_fields = ['user', 'list']
    filter_horizontal = ['tags']


@admin.register(Subtask)
class SubtaskAdmin(admin.ModelAdmin):
    list_display = ['title', 'task', 'completed', 'created_at']
    list_filter = ['completed', 'task']
    search_fields = ['title', 'task__title']
    raw_id_fields = ['task']


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'color', 'created_at', 'updated_at']
    list_filter = ['color', 'user']
    search_fields = ['title', 'body', 'user__username', 'user__email']
    raw_id_fields = ['user']


@admin.register(CalendarEvent)
class CalendarEventAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'date', 'start_time', 'end_time', 'color']
    list_filter = ['date', 'color', 'user']
    search_fields = ['title', 'description', 'user__username', 'user__email']
    raw_id_fields = ['user']
    date_hierarchy = 'date'


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['message', 'user', 'dedup_key', 'read', 'created_at']
    list_filter = ['read', 'user']
    search_fields = ['message', 'dedup_key', 'user__username', 'user__email']
    raw_id_fields = ['user']
