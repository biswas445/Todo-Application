"""
Django signals for server-side notification generation.

Generating the task-completion notification on the server keeps it consistent
regardless of which client (or raw API caller) marks a task complete, and
guarantees it exists even if a client fails to POST its own notification.

The dedup key matches the client-side scheme (``task-completed:<task id>``),
and the unique ``(user, dedup_key)`` constraint combined with ``get_or_create``
ensures the server and client can never double-create the same notification.
"""
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from .models import Task, Notification


@receiver(pre_save, sender=Task)
def capture_previous_completed(sender, instance, **kwargs):
    """Stash the stored ``completed`` flag so post_save can detect a transition."""
    # ``raw=True`` during loaddata/fixtures: skip the extra read entirely.
    if kwargs.get('raw'):
        return
    if instance.pk:
        previous = (
            Task.objects.filter(pk=instance.pk)
            .values_list('completed', flat=True)
            .first()
        )
        instance._previous_completed = bool(previous)
    else:
        instance._previous_completed = False


@receiver(post_save, sender=Task)
def create_task_completed_notification(sender, instance, created, **kwargs):
    """Create a completion notification when a task flips to completed."""
    # ``raw=True`` during loaddata/fixtures: rows are being deserialized, not
    # user-driven, so they must not generate notifications.
    if kwargs.get('raw'):
        return
    if created:
        return
    if not instance.completed or getattr(instance, '_previous_completed', False):
        return
    # Completion notifications are gated by the push-notifications master
    # switch; the task-reminders setting only controls reminder types.
    if not instance.user.push_notifications:
        return

    name = instance.user.get_full_name() or instance.user.username
    message = f'Hi, {name} You Finished This Task: {instance.title}.'
    Notification.objects.get_or_create(
        user=instance.user,
        dedup_key=f'task-completed:{instance.id}',
        defaults={'message': message},
    )
