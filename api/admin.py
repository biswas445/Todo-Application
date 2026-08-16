"""
Django admin configuration for Organic Mind.
Provides useful list displays and search/filtering for all models.
"""
from django.contrib import admin
from .models import User, List, Tag, Task, Subtask, Note, CalendarEvent


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name', 'timezone', 'date_joined']
    list_filter = ['timezone', 'date_format', 'start_of_week', 'time_format']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    readonly_fields = ['email', 'last_login', 'date_joined']
    
    fieldsets = (
        ('Account', {'fields': ('username', 'email', 'password')}),
        ('Profile', {'fields': ('first_name', 'last_name', 'bio')}),
        ('Settings', {'fields': ('timezone', 'date_format', 'start_of_week', 'time_format')}),
        ('Notifications', {'fields': ('push_notifications', 'task_reminders')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
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
