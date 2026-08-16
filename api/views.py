"""
Django REST Framework viewsets for Organic Mind.
Implements user ownership isolation at the backend level.
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import get_user_model, authenticate
from .models import List, Tag, Task, Subtask, Note, CalendarEvent
from .serializers import (
    UserSerializer, UserRegistrationSerializer, ChangePasswordSerializer,
    ListSerializer, TagSerializer, TaskSerializer, SubtaskSerializer,
    NoteSerializer, CalendarEventSerializer
)

User = get_user_model()


class IsOwner(permissions.BasePermission):
    """Permission class to ensure users can only access their own data."""
    
    def has_object_permission(self, request, view, obj):
        # All models have a 'user' field
        return hasattr(obj, 'user') and obj.user == request.user


class AuthViewSet(viewsets.ViewSet):
    """Authentication endpoints: register, login, logout."""
    permission_classes = []  # Allow unauthenticated access for auth
    
    @action(detail=False, methods=['post'])
    def register(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            token, _ = Token.objects.get_or_create(user=user)
            return Response({
                'token': token.key,
                'user': UserSerializer(user).data
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def login(self, request):
        email = request.data.get('email')
        password = request.data.get('password')
        
        if not email or not password:
            return Response(
                {'error': 'Email and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Find user by email and authenticate using username
        try:
            user = User.objects.get(email=email)
            # Authenticate using the username field
            authenticated_user = authenticate(
                request, 
                username=user.username, 
                password=password
            )
        except User.DoesNotExist:
            authenticated_user = None
        
        if authenticated_user:
            token, _ = Token.objects.get_or_create(user=authenticated_user)
            return Response({
                'token': token.key,
                'user': UserSerializer(authenticated_user).data
            })
        
        return Response(
            {'error': 'Invalid email or password.'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    @action(detail=False, methods=['post'])
    def logout(self, request):
        request.user.auth_token.delete()
        return Response({'message': 'Logged out successfully.'})


class UserViewSet(viewsets.ModelViewSet):
    """User profile management."""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        return User.objects.filter(id=self.request.user.id)
    
    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)
    
    @action(detail=False, methods=['patch'])
    def update_profile(self, request):
        user = request.user
        # Remove username from request data to enforce immutability
        data = request.data.copy()
        if 'username' in data:
            del data['username']
        serializer = self.get_serializer(user, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def change_password(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            if not user.check_password(serializer.validated_data['current_password']):
                return Response(
                    {'error': 'Current password is incorrect.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            return Response({'message': 'Password changed successfully.'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['delete'], url_path='account')
    def delete_account(self, request):
        """Delete user account after verifying current password."""
        password = request.data.get('password')
        if not password:
            return Response(
                {'error': 'Password is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user = request.user
        if not user.check_password(password):
            return Response(
                {'error': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        # Delete user's authentication token
        try:
            user.auth_token.delete()
        except:
            pass  # Token may not exist
        # Delete user (cascade will handle related objects)
        user.delete()
        return Response({'message': 'Account deleted successfully.'})


class ListViewSet(viewsets.ModelViewSet):
    """CRUD for task lists."""
    serializer_class = ListSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        return List.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TagViewSet(viewsets.ModelViewSet):
    """CRUD for tags."""
    serializer_class = TagSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        return Tag.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TaskViewSet(viewsets.ModelViewSet):
    """CRUD for tasks with subtasks support."""
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        queryset = Task.objects.filter(user=self.request.user)
        
        # Search filter (case-insensitive title or description)
        search = self.request.query_params.get('search', None)
        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(description__icontains=search)
            )
        
        # Completed filter
        completed = self.request.query_params.get('completed', None)
        if completed is not None:
            if completed.lower() == 'true':
                queryset = queryset.filter(completed=True)
            elif completed.lower() == 'false':
                queryset = queryset.filter(completed=False)
        
        # List filter
        list_id = self.request.query_params.get('list', None)
        if list_id:
            queryset = queryset.filter(list_id=list_id)
        
        # Tag filter (using 'tags' as the param name based on test)
        tag_id = self.request.query_params.get('tags', None)
        if tag_id:
            queryset = queryset.filter(tags__id=tag_id)
        
        # Due date filter
        due_date = self.request.query_params.get('due_date', None)
        if due_date:
            queryset = queryset.filter(due_date=due_date)
        
        # Today filter
        today = self.request.query_params.get('today', None)
        if today and today.lower() == 'true':
            from datetime import date
            queryset = queryset.filter(due_date=date.today())
        
        # Upcoming filter (incomplete tasks with future due dates)
        upcoming = self.request.query_params.get('upcoming', None)
        if upcoming and upcoming.lower() == 'true':
            from datetime import date
            queryset = queryset.filter(completed=False, due_date__gt=date.today())
        
        return queryset.distinct()
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
    
    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        task = self.get_object()
        task.completed = not task.completed
        task.save()
        return Response(self.get_serializer(task).data)
    
    @action(detail=True, methods=['post'])
    def add_subtask(self, request, pk=None):
        task = self.get_object()
        title = request.data.get('title', '').strip()[:200]
        if not title:
            return Response(
                {'error': 'Subtask title is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        subtask = Subtask.objects.create(task=task, title=title)
        return Response(SubtaskSerializer(subtask).data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'], url_path='subtasks/(?P<subtask_pk>[^/.]+)/toggle')
    def toggle_subtask(self, request, pk=None, subtask_pk=None):
        try:
            subtask = Subtask.objects.get(id=subtask_pk, task__user=request.user)
            subtask.completed = not subtask.completed
            subtask.save()
            return Response(SubtaskSerializer(subtask).data)
        except Subtask.DoesNotExist:
            return Response(
                {'error': 'Subtask not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['delete'], url_path='subtasks/(?P<subtask_pk>[^/.]+)')
    def delete_subtask(self, request, pk=None, subtask_pk=None):
        try:
            subtask = Subtask.objects.get(id=subtask_pk, task__user=request.user)
            subtask.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Subtask.DoesNotExist:
            return Response(
                {'error': 'Subtask not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=False, methods=['patch', 'put'], url_path='subtasks/(?P<subtask_pk>[^/.]+)/update')
    def update_subtask(self, request, subtask_pk=None):
        try:
            subtask = Subtask.objects.get(id=subtask_pk, task__user=request.user)
            title = request.data.get('title', '').strip()[:200]
            if title:
                subtask.title = title
                subtask.save()
            return Response(SubtaskSerializer(subtask).data)
        except Subtask.DoesNotExist:
            return Response(
                {'error': 'Subtask not found.'},
                status=status.HTTP_404_NOT_FOUND
            )


class NoteViewSet(viewsets.ModelViewSet):
    """CRUD for sticky notes."""
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        return Note.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class CalendarEventViewSet(viewsets.ModelViewSet):
    """CRUD for calendar events."""
    serializer_class = CalendarEventSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        return CalendarEvent.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
