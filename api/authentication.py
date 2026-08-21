"""
Custom DRF authentication for Organic Mind.
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed


class ExpiringTokenAuthentication(TokenAuthentication):
    """TokenAuthentication that rejects tokens older than TOKEN_EXPIRY_DAYS.

    DRF's default tokens never expire, so a leaked token grants access
    forever. Here tokens stay valid for a bounded window and are rotated on
    every login (the login view deletes the old token and issues a new one),
    so a stolen token stops working at the latest when it expires or the
    real owner signs in again.
    """

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        max_age = timedelta(days=settings.TOKEN_EXPIRY_DAYS)
        if token.created < timezone.now() - max_age:
            raise AuthenticationFailed(
                'Token has expired. Please sign in again.'
            )
        return user, token
