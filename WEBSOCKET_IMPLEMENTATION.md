# Real-Time Notifications with WebSocket Integration

## Overview
Successfully implemented real-time notifications using Django Channels and WebSockets to replace polling-based updates with instant push notifications.

## Backend Implementation

### 1. Dependencies Installed
- `channels` (4.3.2) - Django WebSocket support
- `daphne` (4.2.3) - ASGI server for WebSockets
- `channels-redis` (4.3.0) - Redis channel layer (optional for production)

### 2. Configuration Changes

#### `settings.py`
```python
INSTALLED_APPS = [
    # ... other apps
    'channels',
]

ASGI_APPLICATION = 'organic_mind_backend.asgi.application'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
        # For production with Redis:
        # 'BACKEND': 'channels_redis.core.RedisChannelLayer',
        # 'CONFIG': {'hosts': [('localhost', 6379)]},
    },
}
```

#### `asgi.py`
Configured to handle both HTTP and WebSocket connections with authentication middleware.

### 3. WebSocket Consumer (`api/websocket.py`)
Created `NotificationConsumer` class that:
- Authenticates users via token
- Creates user-specific notification groups
- Handles various event types (task_created, task_updated, task_deleted, note_created, event_created)
- Supports automatic reconnection

### 4. Enhanced Views (`api/views.py`)
Added real-time notification triggers to all CRUD operations:
- **ListViewSet**: Notifies on list create/delete
- **TagViewSet**: Notifies on tag create/delete
- **TaskViewSet**: Notifies on task create/update/delete/toggle
- **NoteViewSet**: Notifies on note create/update/delete
- **CalendarEventViewSet**: Notifies on event create/update/delete

Each notification includes:
- Message text
- Event type
- Serialized object data (for create/update events)

## Frontend Implementation

### 1. Custom Hook (`src/hooks/useWebSocketNotifications.ts`)
Created reusable React hook that:
- Establishes WebSocket connection with auth token
- Handles automatic reconnection (up to 5 attempts)
- Parses incoming messages
- Dispatches to appropriate callbacks
- Cleans up on unmount

Features:
- Connection status tracking
- Configurable event handlers
- Error handling and logging
- Exponential backoff reconnection

### 2. Usage Example
```typescript
import { useWebSocketNotifications } from './hooks/useWebSocketNotifications';

function Dashboard() {
  const { connected } = useWebSocketNotifications({
    enabled: true,
    onNotification: (data) => {
      // Show toast notification
      showToast(data.message);
    },
    onTaskCreated: (task) => {
      // Add task to local state
      setTasks(prev => [...prev, task]);
    },
    onTaskUpdated: (task) => {
      // Update task in local state
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    },
    onTaskDeleted: (data) => {
      // Remove task from local state
      setTasks(prev => prev.filter(t => t.id !== data.id));
    },
  });

  return (
    <div>
      {connected ? '🟢 Live' : '🔴 Disconnected'}
      {/* ... rest of component */}
    </div>
  );
}
```

## How It Works

1. **User logs in** → Token stored in localStorage
2. **Dashboard loads** → WebSocket hook connects to `ws://host/ws/notifications/?token=xxx`
3. **Backend authenticates** → User joins their personal notification group
4. **CRUD operation occurs** → View triggers `channel_layer.group_send()`
5. **WebSocket receives message** → Hook parses and dispatches to callbacks
6. **UI updates instantly** → No polling required

## Testing

### Backend Check
```bash
python manage.py check
# Output: System check identified no issues (0 silenced).
```

### Frontend Build
```bash
npm run build
# Output: ✓ built in 6.90s (no errors)
```

## Production Deployment

### 1. Install Redis
```bash
# Ubuntu/Debian
sudo apt-get install redis-server

# macOS
brew install redis
```

### 2. Update Settings
```python
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [('localhost', 6379)],
        },
    },
}
```

### 3. Run Daphne
```bash
# Development
daphne -b 0.0.0.0 -p 8000 organic_mind_backend.asgi:application

# Production with gunicorn
pip install gunicorn
gunicorn organic_mind_backend.asgi:application -w 4 -b 0.0.0.0:8000 -k uvicorn.workers.UvicornWorker
```

### 4. Nginx Configuration (Optional)
```nginx
location /ws/ {
    proxy_pass http://localhost:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

## Benefits

✅ **Instant Updates** - No delay between action and notification
✅ **Reduced Server Load** - No constant polling requests
✅ **Better UX** - Real-time feedback on all actions
✅ **Scalable** - Redis channel layer supports multiple workers
✅ **Secure** - Token-based authentication
✅ **Resilient** - Automatic reconnection on disconnect

## Files Modified/Created

### Backend
- `/workspace/organic_mind_backend/settings.py` - Added Channels config
- `/workspace/organic_mind_backend/asgi.py` - WebSocket routing
- `/workspace/api/websocket.py` - NEW: WebSocket consumer
- `/workspace/api/views.py` - Added notification triggers

### Frontend
- `/workspace/src/hooks/useWebSocketNotifications.ts` - NEW: React hook

## Next Steps (Optional Enhancements)

1. **Toast Notifications** - Integrate with react-toastify for visual alerts
2. **Notification Badge** - Show unread count in sidebar
3. **Notification History** - Store notifications in database
4. **Sound Alerts** - Play sound on important notifications
5. **Presence Indicators** - Show when user is online/offline
