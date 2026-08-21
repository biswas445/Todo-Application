"""
ASGI config for organic_mind_backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/stable/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'organic_mind_backend.settings')

# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.urls import path

from api.middleware import TokenAuthMiddleware
from api.websocket import websocket_urlpatterns

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        # Session auth runs first; TokenAuthMiddleware then overrides
        # scope['user'] when a ?ticket= query parameter is present.
        AuthMiddlewareStack(
            TokenAuthMiddleware(
                URLRouter(websocket_urlpatterns)
            )
        )
    ),
})
