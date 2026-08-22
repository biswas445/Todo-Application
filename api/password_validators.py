"""Custom Django password validators."""
import re

from django.core.exceptions import ValidationError


class ComplexityPasswordValidator:
    """Require a mix of character classes in passwords.

    A valid password contains at least one uppercase letter, one lowercase
    letter, one number, and one special (non-alphanumeric) character.
    """

    REQUIREMENTS = (
        (re.compile(r'[A-Z]'), 'an uppercase letter'),
        (re.compile(r'[a-z]'), 'a lowercase letter'),
        (re.compile(r'\d'), 'a number'),
        (re.compile(r'[^A-Za-z0-9]'), 'a special character'),
    )

    def validate(self, password, user=None):
        missing = [
            label
            for pattern, label in self.REQUIREMENTS
            if not pattern.search(password)
        ]
        if missing:
            raise ValidationError(
                'Password must contain ' + ', '.join(missing) + '.',
                code='password_missing_complexity',
            )

    def get_help_text(self):
        return (
            'Your password must contain at least one uppercase letter, one '
            'lowercase letter, one number, and one special character.'
        )
