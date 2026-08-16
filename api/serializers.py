"""
Django REST Framework serializers for Organic Mind.
Mirrors frontend TypeScript types and provides validation limits.
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import List, Tag, Task, Subtask, Note, CalendarEvent

User = get_user_model()


def validate_bio_words(value):
    """Validate that bio does not exceed 200 words."""
    if value:
        words = value.split()
        if len(words) > 200:
            raise serializers.ValidationError('Bio must not exceed 200 words.')
    return value


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user profile."""
    email = serializers.EmailField(read_only=True)
    username = serializers.CharField(read_only=True)  # Username is permanent after registration
    bio = serializers.CharField(
        required=False,
        allow_blank=True,
        validators=[validate_bio_words]
    )
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'bio', 'timezone', 'date_format', 'start_of_week',
            'time_format', 'push_notifications', 'task_reminders'
        ]
        read_only_fields = ['id', 'email', 'username']  # Username is immutable like email
    
    def validate_timezone(self, value):
        """Validate timezone against common IANA timezones."""
        valid_timezones = [
            'UTC', 'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific',
            'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
            'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
            'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Tokyo', 'Asia/Shanghai',
            'Australia/Sydney', 'Australia/Melbourne',
        ]
        if value not in valid_timezones:
            # Allow any value that looks like a valid IANA timezone
            if '/' not in value and value not in ['UTC']:
                raise serializers.ValidationError('Invalid timezone format.')
        return value


class UserRegistrationSerializer(serializers.ModelSerializer):
    """Serializer for user registration."""
    password = serializers.CharField(write_only=True, min_length=6)
    
    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name']
    
    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        return user


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change."""
    current_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, min_length=6)
    confirm_password = serializers.CharField(required=True, write_only=True)
    
    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'New passwords do not match.'})
        return data


class SubtaskSerializer(serializers.ModelSerializer):
    """Serializer for subtasks."""
    id = serializers.CharField(read_only=True)
    
    class Meta:
        model = Subtask
        fields = ['id', 'title', 'completed', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def create(self, validated_data):
        task = self.context.get('task')
        if not task:
            raise serializers.ValidationError({'task': 'Task is required.'})
        validated_data['title'] = validated_data['title'][:200]
        return Subtask.objects.create(task=task, **validated_data)


class ListSerializer(serializers.ModelSerializer):
    """Serializer for task lists."""
    id = serializers.CharField(read_only=True)
    task_count = serializers.SerializerMethodField()
    
    class Meta:
        model = List
        fields = ['id', 'label', 'color', 'created_at', 'updated_at', 'task_count']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_task_count(self, obj):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            return obj.tasks.filter(user=request.user).count()
        return 0
    
    def validate_label(self, value):
        return value[:60]


class TagSerializer(serializers.ModelSerializer):
    """Serializer for tags."""
    id = serializers.CharField(read_only=True)
    task_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Tag
        fields = ['id', 'label', 'color', 'created_at', 'updated_at', 'task_count']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_task_count(self, obj):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            return obj.tasks.filter(user=request.user).count()
        return 0
    
    def validate_label(self, value):
        return value[:40]


class TaskSerializer(serializers.ModelSerializer):
    """Serializer for tasks."""
    id = serializers.CharField(read_only=True)
    list_id = serializers.CharField(source='list.id', read_only=True)
    list = serializers.PrimaryKeyRelatedField(
        queryset=List.objects.none(),
        allow_null=True,
        required=False
    )
    tag_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        source='tags',
        queryset=Tag.objects.none(),
        required=False,
        write_only=True
    )
    subtasks = SubtaskSerializer(many=True, read_only=True)
    
    class Meta:
        model = Task
        fields = [
            'id', 'title', 'description', 'completed', 'priority', 'color',
            'due_date', 'list', 'list_id', 'tag_ids', 'subtasks',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            self.fields['list'].queryset = List.objects.filter(user=request.user)
            self.fields['tag_ids'].child_relation.queryset = Tag.objects.filter(user=request.user)
    
    def validate_title(self, value):
        return value[:120]
    
    def validate_description(self, value):
        return value[:2000] if value else ''
    
    def create(self, validated_data):
        tags = validated_data.pop('tags', [])
        task = Task.objects.create(**validated_data)
        task.tags.set(tags)
        return task
    
    def update(self, instance, validated_data):
        tags = validated_data.pop('tags', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if tags is not None:
            instance.tags.set(tags)
        return instance


class NoteSerializer(serializers.ModelSerializer):
    """Serializer for sticky notes."""
    id = serializers.CharField(read_only=True)
    # Override fields to allow longer input that gets truncated in validate_* methods
    title = serializers.CharField(required=False, allow_blank=True)
    body = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        model = Note
        fields = ['id', 'title', 'body', 'color', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_title(self, value):
        return (value or 'Untitled')[:100]
    
    def validate_body(self, value):
        return (value or '')[:2000]


class CalendarEventSerializer(serializers.ModelSerializer):
    """Serializer for calendar events."""
    id = serializers.CharField(read_only=True)
    date = serializers.DateField(format='%Y-%m-%d', input_formats=['%Y-%m-%d'])
    # Override fields to allow longer input that gets truncated in validate_* methods
    title = serializers.CharField(required=True, allow_blank=False)
    description = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        model = CalendarEvent
        fields = [
            'id', 'title', 'description', 'date', 'start_time', 'end_time',
            'color', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_title(self, value):
        # Truncate to model max_length (120) - DRF will enforce this on save
        return (value or '')[:120]
    
    def validate_description(self, value):
        return (value or '')[:1000]
    
    def validate(self, data):
        if data.get('end_time') and data.get('start_time'):
            if data['end_time'] < data['start_time']:
                raise serializers.ValidationError({'end_time': 'End time must be after start time.'})
        return data
