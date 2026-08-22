"""
Seed (or reset) a user with known credentials for Playwright end-to-end tests.

This command creates a user the browser tests can sign in with through the
real UI. The user is deleted and recreated on every run so each E2E session
starts from a clean slate.

Credentials default to the same values the Playwright spec uses; override both
together via the E2E_EMAIL / E2E_PASSWORD environment variables.
"""
import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

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
        parser.add_argument(
            '--force',
            action='store_true',
            help='Run even when DEBUG is off (production).',
        )

    def handle(self, *args, **options):
        # Production guard: this command deletes any matching user (CASCADE
        # wipes their data) and creates an account with known credentials, so
        # it must never run against a production database by accident.
        if not settings.DEBUG and not options['force']:
            raise CommandError(
                'Refusing to seed the e2e user while DEBUG is off. This '
                'command deletes the matching user (cascading to all of '
                'their data) and creates an account with known credentials. '
                'Pass --force to override in a deliberate non-production run.'
            )

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

        self.stdout.write(self.style.SUCCESS(
            f'Seeded e2e user {user.email}.'
        ))
