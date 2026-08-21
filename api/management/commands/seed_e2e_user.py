"""
Seed (or reset) an active user for Playwright end-to-end tests.

Normal sign-up requires email verification, which is impractical to automate in
an E2E run (the dev email backend only prints the link to the server log).
This command creates an already-active user with known credentials so the
browser tests can sign in through the real UI. The user is deleted and
recreated on every run so each E2E session starts from a clean slate.

Credentials default to the same values the Playwright spec uses; override both
together via the E2E_EMAIL / E2E_PASSWORD environment variables.
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()

DEFAULT_EMAIL = 'e2e@organicmind.local'
DEFAULT_PASSWORD = 'e2e-test-password-123'


class Command(BaseCommand):
    help = 'Create (or reset) an active user for Playwright end-to-end tests.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            default=os.environ.get('E2E_EMAIL', DEFAULT_EMAIL),
            help='Email/username for the e2e user.',
        )
        parser.add_argument(
            '--password',
            default=os.environ.get('E2E_PASSWORD', DEFAULT_PASSWORD),
            help='Password for the e2e user.',
        )

    def handle(self, *args, **options):
        email = options['email']
        password = options['password']

        # Remove any previous e2e user so the run starts clean; CASCADE clears
        # their tasks, lists, tags, notes, events, and notifications.
        User.objects.filter(email__iexact=email).delete()

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name='E2E',
            last_name='Tester',
        )
        # Bypass email verification: mark the account active directly.
        user.is_active = True
        user.save(update_fields=['is_active'])

        self.stdout.write(self.style.SUCCESS(
            f'Seeded active e2e user {user.email}.'
        ))
