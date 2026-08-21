import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Store } from '@/store/useAppStore';
import { formatDate, formatTime, localISO } from '@/utils/format';

export function NotificationsView({ store }: { store: Store }) {
  const { data, clearNotifications, markAllNotificationsRead } = store;
  const timeFormat = data.settings.timeFormat;
  const dateFormat = data.settings.dateFormat;
  const [confirming, setConfirming] = useState(false);

  // Opening the view marks any unread notifications as read (also catches
  // new reminders that arrive while the view stays open).
  useEffect(() => {
    if (data.notifications.some((n) => !n.read)) {
      markAllNotificationsRead();
    }
  }, [data.notifications, markAllNotificationsRead]);

  const handleClear = () => {
    setConfirming(false);
    clearNotifications();
  };

  return (
    <div className="view-content">
      <div className="view-heading">
        <div><h1>Notifications</h1><span className="count-badge">{data.notifications.length}</span></div>
        {data.notifications.length > 0 && (
          confirming ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>Clear all notifications?</span>
              <button className="danger-btn" onClick={handleClear}>Clear</button>
              <button className="outline-button small-btn" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button className="outline-button" onClick={() => setConfirming(true)}><Trash2 size={16} />Clear All</button>
          )
        )}
      </div>

      {data.notifications.length === 0 ? (
        <div className="empty-state">
          <p>No notifications yet.</p>
        </div>
      ) : (
        <div className="notifications-list">
          {data.notifications.slice().reverse().map((notification) => {
            const date = new Date(notification.timestamp);
            // Derive the displayed date from the local Date, not from the raw
            // ISO string: splitting on 'T' yields the UTC date, which can be a
            // day off from the local date near midnight.
            const dateStr = formatDate(localISO(date), dateFormat);
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
