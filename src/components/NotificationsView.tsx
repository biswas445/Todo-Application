import { Bell } from 'lucide-react';
import type { Store } from '@/store/useAppStore';
import { formatDate, formatTime } from '@/utils/format';

export function NotificationsView({ store }: { store: Store }) {
  const { data } = store;
  const timeFormat = data.settings.timeFormat;
  const dateFormat = data.settings.dateFormat;

  return (
    <div className="view-content">
      <div className="view-heading">
        <div><h1>Notifications</h1><span className="count-badge">{data.notifications.length}</span></div>
      </div>

      {data.notifications.length === 0 ? (
        <div className="empty-state">
          <Bell size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p>No notifications yet.</p>
        </div>
      ) : (
        <div className="notifications-list">
          {data.notifications.slice().reverse().map((notification) => {
            const date = new Date(notification.timestamp);
            const dateStr = formatDate(notification.timestamp.split('T')[0], dateFormat);
            const timeStr = formatTime(date.toTimeString().slice(0, 5), timeFormat);
            
            return (
              <div key={notification.id} className={`notification-item ${notification.read ? 'read' : 'unread'}`}>
                <div className="notification-content">
                  <p className="notification-message">{notification.message}</p>
                  <span className="notification-timestamp">{dateStr} · {timeStr}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationsView;
