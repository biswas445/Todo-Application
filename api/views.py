"""
Django REST Framework viewsets for Organic Mind.
Implements user ownership isolation at the backend level.
"""
from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import get_user_model, authenticate
from django.db import IntegrityError, connection, transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from datetime import date as date_cls
import logging
import zoneinfo
from .middleware import generate_ws_ticket
from .models import List, Tag, Task, Subtask, Note, CalendarEvent, Notification
from .serializers import (
    UserSerializer, UserRegistrationSerializer, ChangePasswordSerializer,
    ListSerializer, TagSerializer, TaskSerializer, SubtaskSerializer,
    NoteSerializer, CalendarEventSerializer, NotificationSerializer
)

User = get_user_model()
channel_layer = get_channel_layer()
logger = logging.getLogger(__name__)

# Salted signing ties verification tokens to SECRET_KEY without extra storage.
EMAIL_VERIFICATION_SALT = 'organic-mind-email-verification'


def generate_email_verification_token(user):
    """Signed, timestamped token proving control of the account's email."""
    return signing.dumps({'user_id': str(user.pk)}, salt=EMAIL_VERIFICATION_SALT)


def get_owned_subtask(subtask_pk, user):
    """Return the subtask owned by ``user`` or None.

    The URL pattern accepts any non-slash/non-dot string, so ``subtask_pk``
    may not be a valid UUID. A malformed UUID makes the ORM raise
    ``ValidationError`` (not ``DoesNotExist``), which must be treated as a
    404 rather than allowed to bubble up as a 500.
    """
    try:
        return Subtask.objects.get(id=subtask_pk, task__user=user)
    except (Subtask.DoesNotExist, DjangoValidationError, ValueError):
        return None


def clean_subtask_title(value):
    """Return a stripped, length-capped title string, or None if invalid.

    Callers may send a non-string ``title`` (number, list, object); calling
    ``.strip()`` on those would raise ``AttributeError`` and 500, so the type
    is checked first.
    """
    if not isinstance(value, str):
        return None
    return value.strip()[:200] or None


def user_local_today(user):
    """Return today's date in the user's configured timezone.

    Falls back to UTC if the stored timezone is missing/invalid. Used for the
    ``today``/``upcoming`` task filters so results match the user's local
    calendar instead of the server's UTC clock.
    """
    tz_name = getattr(user, 'timezone', None) or 'UTC'
    try:
        tz = zoneinfo.ZoneInfo(tz_name)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        tz = zoneinfo.ZoneInfo('UTC')
    return timezone.now().astimezone(tz).date()


def send_verification_email(request, user):
    """Email the signed verification link. Returns True if it was sent.

    Wrapped so a failing email backend does not turn registration into a 500
    (the account row already exists by the time this runs). On failure the
    caller can point the user at the resend endpoint.
    """
    token = generate_email_verification_token(user)
    verify_url = (
        request.build_absolute_uri('/api/auth/verify_email/')
        + f'?token={token}'
    )
    name = user.get_full_name() or user.username
    try:
        send_mail(
            subject='Verify your Organic Mind account',
            message=(
                f'Hi {name},\n\n'
                'Welcome to Organic Mind! Please confirm your email '
                'address by opening the link below:\n\n'
                f'{verify_url}\n\n'
                f'This link expires in '
                f'{settings.EMAIL_VERIFICATION_MAX_AGE_SECONDS // 3600} '
                'hours. If you did not create an account, you can safely '
                'ignore this email.'
            ),
            from_email=None,  # uses DEFAULT_FROM_EMAIL
            recipient_list=[user.email],
        )
        return True
    except Exception:
        logger.exception('Failed to send verification email to %s', user.email)
        return False


@require_GET
def health_check(request):
    """Liveness/readiness probe for load balancers and monitoring.

    Unauthenticated by design. Reports whether the database is reachable so an
    orchestrator can distinguish a healthy process from a degraded one.
    """
    try:
        connection.ensure_connection()
        database_ok = True
    except Exception:  # pragma: no cover - exercised only when DB is down
        database_ok = False

    healthy = database_ok
    return JsonResponse(
        {'status': 'ok' if healthy else 'degraded', 'database': database_ok},
        status=200 if healthy else 503,
    )


class IsOwner(permissions.BasePermission):
    """Permission class to ensure users can only access their own data."""
    
    def has_object_permission(self, request, view, obj):
        # All models have a 'user' field
        return hasattr(obj, 'user') and obj.user == request.user


class AuthViewSet(viewsets.ViewSet):
    """Authentication endpoints: register, login, logout."""
    permission_classes = []  # Allow unauthenticated access for auth

    # The credential endpoints below also set authentication_classes=[] so a
    # stale/expired/rotated token carried in the Authorization header cannot
    # make DRF reject the request with 401 before the view runs. Without this,
    # a client whose token has expired could never reach /login/ to get a new
    # one (lockout). ws_ticket and logout intentionally keep authentication.

    @action(detail=False, methods=['post'], authentication_classes=[])
    def register(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            # The account stays inactive until the email is confirmed; no
            # token is issued here. The link is signed with SECRET_KEY and
            # expires after EMAIL_VERIFICATION_MAX_AGE_SECONDS.
            sent = send_verification_email(request, user)
            message = (
                'Account created. Check your email and open the '
                'verification link before signing in.'
                if sent else
                'Account created, but the verification email could not be '
                'sent just now. Use "resend verification email" to try again.'
            )
            return Response({
                'message': message,
                'user': UserSerializer(user).data,
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='resend_verification',
            authentication_classes=[])
    def resend_verification(self, request):
        """Re-send the verification link for an unverified account.

        Covers the case where the original signup email failed to send or was
        lost. The response is identical whether or not the account exists so
        the endpoint cannot be used to enumerate unverified emails.
        """
        email = request.data.get('email', '')
        user = User.objects.filter(email__iexact=email, is_active=False).first()
        if user is not None:
            send_verification_email(request, user)
        return Response({
            'message': (
                'If an unverified account exists for that email, a new '
                'verification link has been sent.'
            )
        })

    @action(detail=False, methods=['get'], url_path='verify_email',
            authentication_classes=[])
    def verify_email(self, request):
        """Activate an account using the signed token emailed at registration."""
        token = request.query_params.get('token', '')
        try:
            payload = signing.loads(
                token,
                salt=EMAIL_VERIFICATION_SALT,
                max_age=settings.EMAIL_VERIFICATION_MAX_AGE_SECONDS,
            )
        except signing.BadSignature:
            return Response(
                {'error': 'This verification link is invalid or has expired.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user = User.objects.filter(pk=payload.get('user_id')).first()
        if user is None:
            return Response(
                {'error': 'This verification link is invalid.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=['is_active'])
        return Response({'message': 'Email verified. You can now sign in.'})

    @action(
        detail=False,
        methods=['post'],
        url_path='ws_ticket',
        permission_classes=[permissions.IsAuthenticated],
    )
    def ws_ticket(self, request):
        """Issue a short-lived ticket for WebSocket authentication.

        The long-lived API token never appears in the WebSocket URL (query
        strings leak into server and proxy logs); the ticket is only valid
        for WS_TICKET_MAX_AGE seconds.
        """
        return Response({'ticket': generate_ws_ticket(request.user)})

    @action(detail=False, methods=['post'], authentication_classes=[])
    def login(self, request):
        email = request.data.get('email')
        password = request.data.get('password')

        if not email or not password:
            return Response(
                {'error': 'Email and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Look the user up case-insensitively: registration already blocks
        # case-variant duplicate emails, so sign-in must not be stricter than
        # sign-up or users who registered "Alice@Example.com" could not log in
        # as "alice@example.com".
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            return Response(
                {'error': 'Invalid email or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        if not user.is_active:
            # Return the same status and message as a bad-credential failure
            # so this endpoint cannot be used to enumerate which emails hold
            # an unverified account. The user can request a fresh link via
            # the resend-verification endpoint.
            return Response(
                {'error': 'Invalid email or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        # Authenticate using the username field
        authenticated_user = authenticate(
            request,
            username=user.username,
            password=password
        )

        if authenticated_user:
            # Rotate the token on every login: a previously stolen token
            # stops working as soon as the real owner signs in again.
            Token.objects.filter(user=authenticated_user).delete()
            token = Token.objects.create(user=authenticated_user)
            return Response({
                'token': token.key,
                'user': UserSerializer(authenticated_user).data
            })

        return Response(
            {'error': 'Invalid email or password.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    @action(detail=False, methods=['post'],
            permission_classes=[permissions.IsAuthenticated])
    def logout(self, request):
        # filter().delete() is safe whether or not a token exists, and works
        # for session-authenticated users who have no DRF token (a direct
        # request.user.auth_token.delete() would raise and 500).
        Token.objects.filter(user=request.user).delete()
        return Response({'message': 'Logged out successfully.'})


class UserViewSet(viewsets.GenericViewSet):
    """User profile management.

    Deliberately a GenericViewSet exposing only the custom actions below:
    a full ModelViewSet would also route DELETE /api/user/{id}/ (deleting
    the account with no password check) and POST /api/user/ (a broken
    create), so those default routes must not exist.
    """
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
        # The request goes into the serializer context so the password
        # policy can compare the new password against this account's
        # attributes (UserAttributeSimilarityValidator).
        serializer = ChangePasswordSerializer(
            data=request.data, context={'request': request}
        )
        if serializer.is_valid():
            user = request.user
            if not user.check_password(serializer.validated_data['current_password']):
                return Response(
                    {'error': 'Current password is incorrect.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            # Rotate the token: sessions established with the old password
            # (including a stolen token) are invalidated. A fresh token is
            # returned so the client making this request stays signed in.
            Token.objects.filter(user=user).delete()
            token = Token.objects.create(user=user)
            return Response({
                'message': 'Password changed successfully.',
                'token': token.key,
            })
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
        # Delete user's authentication token (filter().delete() is a no-op if
        # the token does not exist, so no exception handling is needed).
        Token.objects.filter(user=user).delete()
        # Delete user (cascade will handle related objects)
        user.delete()
        return Response({'message': 'Account deleted successfully.'})


class ListViewSet(viewsets.ModelViewSet):
    """CRUD for task lists."""
    serializer_class = ListSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        # Annotate task_count so the serializer reads it in one query instead
        # of issuing a COUNT per list (N+1) on /api/lists/.
        return List.objects.filter(user=self.request.user).annotate(
            task_count=Count(
                'tasks',
                filter=Q(tasks__user=self.request.user),
                distinct=True,
            )
        )
    
    def perform_create(self, serializer):
        instance = serializer.save(user=self.request.user)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'send_notification',
                'data': {
                    'message': f'List "{instance.label}" created',
                    'type': 'list_created',
                    'object': ListSerializer(instance).data
                }
            }
        )
    
    def perform_destroy(self, instance):
        name = instance.label
        super().perform_destroy(instance)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'send_notification',
                'data': {
                    'message': f'List "{name}" deleted',
                    'type': 'list_deleted'
                }
            }
        )


class TagViewSet(viewsets.ModelViewSet):
    """CRUD for tags."""
    serializer_class = TagSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        # Annotate task_count so the serializer reads it in one query instead
        # of issuing a COUNT per tag (N+1) on /api/tags/.
        return Tag.objects.filter(user=self.request.user).annotate(
            task_count=Count(
                'tasks',
                filter=Q(tasks__user=self.request.user),
                distinct=True,
            )
        )
    
    def perform_create(self, serializer):
        instance = serializer.save(user=self.request.user)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'send_notification',
                'data': {
                    'message': f'Tag "{instance.label}" created',
                    'type': 'tag_created',
                    'object': TagSerializer(instance).data
                }
            }
        )
    
    def perform_destroy(self, instance):
        name = instance.label
        super().perform_destroy(instance)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'send_notification',
                'data': {
                    'message': f'Tag "{name}" deleted',
                    'type': 'tag_deleted'
                }
            }
        )


class TaskViewSet(viewsets.ModelViewSet):
    """CRUD for tasks with subtasks support."""
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        # Eager-load the relations TaskSerializer renders (list FK, tags M2M,
        # subtasks reverse FK) to avoid N+1 queries on the hottest endpoint.
        queryset = (
            Task.objects.filter(user=self.request.user)
            .select_related('list')
            .prefetch_related('tags', 'subtasks')
        )

        # Search filter (case-insensitive title or description)
        search = self.request.query_params.get('search', None)
        if search:
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

        # Due date filter. Parse first so a malformed value is a clean 400
        # instead of a ValidationError/500 from the DateField lookup.
        due_date = self.request.query_params.get('due_date', None)
        if due_date:
            try:
                parsed_due = date_cls.fromisoformat(due_date)
            except ValueError:
                raise DRFValidationError({'due_date': 'Use YYYY-MM-DD format.'})
            queryset = queryset.filter(due_date=parsed_due)

        # "Today" is computed in the user's own timezone so the filter matches
        # their local calendar rather than the server's UTC clock.
        local_today = user_local_today(self.request.user)

        # Today filter
        today = self.request.query_params.get('today', None)
        if today and today.lower() == 'true':
            queryset = queryset.filter(due_date=local_today)

        # Upcoming filter (incomplete tasks with future due dates)
        upcoming = self.request.query_params.get('upcoming', None)
        if upcoming and upcoming.lower() == 'true':
            queryset = queryset.filter(completed=False, due_date__gt=local_today)

        return queryset.distinct()
    
    def perform_create(self, serializer):
        instance = serializer.save(user=self.request.user)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'task_created',
                'data': {
                    'message': f'Task "{instance.title}" created',
                    'type': 'task_created',
                    'object': TaskSerializer(instance).data
                }
            }
        )
    
    def perform_update(self, serializer):
        instance = serializer.save()
        # Send real-time notification for updates
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'task_updated',
                'data': {
                    'message': f'Task "{instance.title}" updated',
                    'type': 'task_updated',
                    'object': TaskSerializer(instance).data
                }
            }
        )
    
    def perform_destroy(self, instance):
        title = instance.title
        task_id = str(instance.id)
        super().perform_destroy(instance)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'task_deleted',
                'data': {
                    'message': f'Task "{title}" deleted',
                    'type': 'task_deleted',
                    'object': {'id': task_id}
                }
            }
        )

    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        task = self.get_object()
        # Re-read under a row lock so two concurrent toggles serialize instead
        # of one overwriting the other (read-modify-write race). Plain
        # select_for_update() is a no-op on SQLite and a real lock elsewhere.
        try:
            with transaction.atomic():
                task = Task.objects.select_for_update().get(pk=task.pk)
                task.completed = not task.completed
                task.save()
        except Task.DoesNotExist:
            # Deleted between get_object() and the locked re-read (TOCTOU);
            # surface a 404 instead of letting DoesNotExist bubble up as a 500.
            return Response(
                {'error': 'Task not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{request.user.id}_notifications",
            {
                'type': 'task_updated',
                'data': {
                    'message': f'Task "{task.title}" marked as {"completed" if task.completed else "incomplete"}',
                    'type': 'task_updated',
                    'object': TaskSerializer(task).data
                }
            }
        )
        return Response(self.get_serializer(task).data)
    
    @action(detail=True, methods=['post'])
    def add_subtask(self, request, pk=None):
        task = self.get_object()
        title = clean_subtask_title(request.data.get('title', ''))
        if title is None:
            return Response(
                {'error': 'Subtask title is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        subtask = Subtask.objects.create(task=task, title=title)
        return Response(SubtaskSerializer(subtask).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='subtasks/(?P<subtask_pk>[^/.]+)/toggle')
    def toggle_subtask(self, request, pk=None, subtask_pk=None):
        subtask = get_owned_subtask(subtask_pk, request.user)
        if subtask is None:
            return Response(
                {'error': 'Subtask not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        # Re-read under a row lock so concurrent toggles serialize instead of
        # one overwriting the other (read-modify-write race), re-checking
        # ownership under the lock. Catch the deleted-between-reads case so it
        # surfaces as a 404 rather than a DoesNotExist 500.
        try:
            with transaction.atomic():
                subtask = Subtask.objects.select_for_update().get(
                    pk=subtask.pk, task__user=request.user
                )
                subtask.completed = not subtask.completed
                subtask.save()
        except Subtask.DoesNotExist:
            return Response(
                {'error': 'Subtask not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        return Response(SubtaskSerializer(subtask).data)

    @action(detail=True, methods=['delete'], url_path='subtasks/(?P<subtask_pk>[^/.]+)')
    def delete_subtask(self, request, pk=None, subtask_pk=None):
        subtask = get_owned_subtask(subtask_pk, request.user)
        if subtask is None:
            return Response(
                {'error': 'Subtask not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        subtask.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['patch', 'put'], url_path='subtasks/(?P<subtask_pk>[^/.]+)/update')
    def update_subtask(self, request, subtask_pk=None):
        subtask = get_owned_subtask(subtask_pk, request.user)
        if subtask is None:
            return Response(
                {'error': 'Subtask not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        title = clean_subtask_title(request.data.get('title', ''))
        if title is None:
            # Reject invalid/empty titles with a 400 instead of silently
            # returning 200 with the subtask unchanged (a no-op that hides
            # the bad input from the caller).
            return Response(
                {'error': 'Subtask title is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        subtask.title = title
        subtask.save()
        return Response(SubtaskSerializer(subtask).data)


class NoteViewSet(viewsets.ModelViewSet):
    """CRUD for sticky notes."""
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        return Note.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        instance = serializer.save(user=self.request.user)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'note_created',
                'data': {
                    'message': f'Note "{instance.title}" created',
                    'type': 'note_created',
                    'object': NoteSerializer(instance).data
                }
            }
        )
    
    def perform_update(self, serializer):
        instance = serializer.save()
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'send_notification',
                'data': {
                    'message': f'Note "{instance.title}" updated',
                    'type': 'note_updated',
                    'object': NoteSerializer(instance).data
                }
            }
        )
    
    def perform_destroy(self, instance):
        title = instance.title
        super().perform_destroy(instance)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'send_notification',
                'data': {
                    'message': f'Note "{title}" deleted',
                    'type': 'note_deleted'
                }
            }
        )


class CalendarEventViewSet(viewsets.ModelViewSet):
    """CRUD for calendar events."""
    serializer_class = CalendarEventSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    
    def get_queryset(self):
        return CalendarEvent.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        instance = serializer.save(user=self.request.user)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'event_created',
                'data': {
                    'message': f'Event "{instance.title}" created',
                    'type': 'event_created',
                    'object': CalendarEventSerializer(instance).data
                }
            }
        )
    
    def perform_update(self, serializer):
        instance = serializer.save()
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'send_notification',
                'data': {
                    'message': f'Event "{instance.title}" updated',
                    'type': 'event_updated',
                    'object': CalendarEventSerializer(instance).data
                }
            }
        )
    
    def perform_destroy(self, instance):
        title = instance.title
        super().perform_destroy(instance)
        # Send real-time notification
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'send_notification',
                'data': {
                    'message': f'Event "{title}" deleted',
                    'type': 'event_deleted'
                }
            }
        )


class NotificationViewSet(viewsets.ModelViewSet):
    """CRUD for persisted notifications.

    Create is idempotent per dedup_key: re-submitting a notification event
    (e.g. a reminder the client already generated) returns the stored
    notification instead of creating a duplicate.
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dedup_key = serializer.validated_data.get('dedup_key')
        if dedup_key:
            existing = Notification.objects.filter(
                user=request.user, dedup_key=dedup_key
            ).first()
            if existing:
                return Response(
                    self.get_serializer(existing).data,
                    status=status.HTTP_200_OK
                )
        try:
            with transaction.atomic():
                self.perform_create(serializer)
        except IntegrityError:
            # Two concurrent POSTs with the same dedup_key both passed the
            # existence check above; the loser hits the unique constraint.
            # Return the winning row so the endpoint stays idempotent (200)
            # instead of surfacing a 500.
            if not dedup_key:
                raise
            winner = Notification.objects.filter(
                user=request.user, dedup_key=dedup_key
            ).first()
            if winner is None:
                raise
            return Response(
                self.get_serializer(winner).data,
                status=status.HTTP_200_OK
            )
        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )

    def update(self, request, *args, **kwargs):
        # Only the read flag may change after creation. dedup_key and message
        # are immutable — letting a PATCH rewrite dedup_key would break the
        # uniqueness invariant the dedup logic relies on.
        instance = self.get_object()
        allowed = {
            key: value for key, value in request.data.items() if key == 'read'
        }
        serializer = self.get_serializer(instance, data=allowed, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def perform_create(self, serializer):
        instance = serializer.save(user=self.request.user)
        # Broadcast so the user's other connected devices receive the
        # notification in real time instead of only on their next reload.
        async_to_sync(channel_layer.group_send)(
            f"user_{self.request.user.id}_notifications",
            {
                'type': 'send_notification',
                'data': {
                    'message': instance.message,
                    'type': 'notification_created',
                    'object': NotificationSerializer(instance).data
                }
            }
        )

    @action(detail=False, methods=['post'], url_path='mark_all_read')
    def mark_all_read(self, request):
        """Mark all of the requesting user's unread notifications as read."""
        updated = Notification.objects.filter(
            user=request.user, read=False
        ).update(read=True)
        return Response({
            'message': 'All notifications marked as read.',
            'updated': updated
        })

    @action(detail=False, methods=['delete'])
    def clear(self, request):
        """Delete all of the requesting user's notifications."""
        deleted, _ = Notification.objects.filter(user=request.user).delete()
        return Response({'message': 'Notifications cleared.', 'deleted': deleted})
