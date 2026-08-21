from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = 'api'

    def ready(self):
        # Import signal handlers so they are registered when the app loads.
        from . import signals  # noqa: F401
