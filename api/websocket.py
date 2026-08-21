"""
WebSocket consumers for real-time notifications
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.urls import path


class NotificationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time notifications
    Handles user-specific notification delivery
    """
    
    async def connect(self):
        # User must be authenticated to connect
        if self.scope["user"].is_anonymous:
            await self.close()
        else:
            # Join a group specific to this user
            self.user_group_name = f"user_{self.scope['user'].id}_notifications"
            
            await self.channel_layer.group_add(
                self.user_group_name,
                self.channel_name
            )
            
            await self.accept()
            
            # Send welcome message
            await self.send(text_data=json.dumps({
                'type': 'connection_established',
                'message': 'Connected to notification service'
            }))

    async def disconnect(self, close_code):
        # Leave the user group
        if hasattr(self, 'user_group_name'):
            await self.channel_layer.group_discard(
                self.user_group_name,
                self.channel_name
            )

    async def receive(self, text_data=None, bytes_data=None):
        """
        Receive message from WebSocket.
        Currently we don't expect messages from client, but keeping for future
        extensibility. Accepts both text and binary frames: the base consumer
        dispatches binary frames as ``bytes_data``, so omitting that keyword
        would raise TypeError and drop the connection.
        """
        if text_data is None:
            return
        try:
            json.loads(text_data)
            # Handle any client messages if needed in future
        except json.JSONDecodeError:
            pass

    async def send_notification(self, event):
        """
        Send notification to WebSocket client
        Called when a notification is added to the user's group
        """
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'data': event['data']
        }))

    async def task_created(self, event):
        """Handle task created events"""
        await self.send(text_data=json.dumps({
            'type': 'task_created',
            'data': event['data']
        }))

    async def task_updated(self, event):
        """Handle task updated events"""
        await self.send(text_data=json.dumps({
            'type': 'task_updated',
            'data': event['data']
        }))

    async def task_deleted(self, event):
        """Handle task deleted events"""
        await self.send(text_data=json.dumps({
            'type': 'task_deleted',
            'data': event['data']
        }))

    async def note_created(self, event):
        """Handle note created events"""
        await self.send(text_data=json.dumps({
            'type': 'note_created',
            'data': event['data']
        }))

    async def event_created(self, event):
        """Handle calendar event created events"""
        await self.send(text_data=json.dumps({
            'type': 'event_created',
            'data': event['data']
        }))


# WebSocket URL patterns
websocket_urlpatterns = [
    path('ws/notifications/', NotificationConsumer.as_asgi()),
]
