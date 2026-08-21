"""
Channels middleware for WebSocket ticket authentication.

The frontend exchanges its API token for a short-lived, single-purpose
ticket (POST /api/auth/ws_ticket/) and connects with it:
    ws://host/ws/notifications/?ticket=<signed ticket>

The long-lived DRF token is never placed in the WebSocket URL, because
query strings are routinely written to server, proxy, and browser history
logs. Tickets are signed with SECRET_KEY, expire after
WS_TICKET_MAX_AGE seconds, and are single-use: each ticket carries a
random nonce that is recorded on first redemption, so a leaked ticket
cannot be replayed even within its short lifetime.
"""
from datetime import timedelta
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core import signing
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.crypto import get_random_string

from .models import WsTicketNonce

WS_TICKET_SALT = 'organic-mind-ws-ticket'


def generate_ws_ticket(user):
    """Signed, timestamped, single-use ticket authorizing a WebSocket connection."""
    return signing.dumps(
        {'user_id': str(user.pk), 'nonce': get_random_string(32)},
        salt=WS_TICKET_SALT,
    )


@database_sync_to_async
def get_user_from_ticket(ticket):
    try:
        payload = signing.loads(
            ticket,
            salt=WS_TICKET_SALT,
            max_age=settings.WS_TICKET_MAX_AGE,
        )
    except signing.BadSignature:
        return AnonymousUser()
    nonce = payload.get('nonce')
    if not nonce:
        return AnonymousUser()
    # Consume the nonce: the unique constraint turns any second redemption
    # of the same ticket into an IntegrityError, so replays are rejected
    # even by concurrent connections.
    try:
        with transaction.atomic():
            WsTicketNonce.objects.create(nonce=nonce)
    except IntegrityError:
        return AnonymousUser()
    # Nonces older than the ticket lifetime can never match a still-valid
    # ticket again, so drop them to keep the table from growing unbounded.
    cutoff = timezone.now() - timedelta(seconds=settings.WS_TICKET_MAX_AGE)
    WsTicketNonce.objects.filter(used_at__lt=cutoff).delete()
    User = get_user_model()
    try:
        return User.objects.get(pk=payload.get('user_id'), is_active=True)
    except User.DoesNotExist:
        return AnonymousUser()


class TokenAuthMiddleware(BaseMiddleware):
    """Resolve scope['user'] from a short-lived ticket query parameter."""

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'websocket':
            query = parse_qs(scope.get('query_string', b'').decode())
            tickets = query.get('ticket', [])
            if tickets:
                scope['user'] = await get_user_from_ticket(tickets[0])
        return await super().__call__(scope, receive, send)
