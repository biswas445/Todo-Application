"""
Channels middleware for WebSocket ticket authentication.

The frontend exchanges its API token for a short-lived, single-purpose
ticket (POST /api/auth/ws_ticket/) and connects with it:
    ws://host/ws/notifications/?ticket=<signed ticket>

The long-lived DRF token is never placed in the WebSocket URL, because
query strings are routinely written to server, proxy, and browser history
logs. Tickets are signed with SECRET_KEY and expire after
WS_TICKET_MAX_AGE seconds, so a leaked ticket is useless almost
immediately.
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core import signing

WS_TICKET_SALT = 'organic-mind-ws-ticket'


def generate_ws_ticket(user):
    """Signed, timestamped ticket authorizing a WebSocket connection."""
    return signing.dumps({'user_id': str(user.pk)}, salt=WS_TICKET_SALT)


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
