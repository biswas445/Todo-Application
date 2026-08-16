import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Task, Store, EntityId } from '@/store/useAppStore';
import type { CalendarEvent, TaskColor } from '@/types';
import { LIMITS } from '@/types';
import { localISO, formatTime, todayStr, formatDate } from '@/utils/format';

type ViewMode = 'Day' | 'Week' | 'Month';
type CalItem = { id: EntityId; title: string; date: string; time: string; color: string; taskId?: EntityId; isTask: boolean; description?: string };

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekStart(d: Date, startOfWeek: 'Monday' | 'Sunday' | 'Saturday') {
  const r = new Date(d); r.setHours(0, 0, 0, 0);
  const dow = r.getDay();
  const offsetMap = { Sunday: 0, Monday: 1, Saturday: 6 };
  const offset = offsetMap[startOfWeek];
  r.setDate(r.getDate() - ((dow - offset + 7) % 7));
  return r;
}
function getWeekRange(d: Date, startOfWeek: 'Monday' | 'Sunday' | 'Saturday') {
  const s = getWeekStart(d, startOfWeek); const e = new Date(s); e.setDate(e.getDate() + 6);
  return `${s.getDate()} ${monthNames[s.getMonth()]} – ${e.getDate()} ${monthNames[e.getMonth()]} ${e.getFullYear()}`;
}

const eventColors: TaskColor[] = ['coral', 'cyan', 'yellow', 'green', 'blue'];
const colorClassMap: Record<string, string> = { coral: 'event-coral', cyan: 'event-cyan', yellow: 'event-yellow', green: 'event-green', blue: 'event-blue' };

export function CalendarView({ store, onOpenTask }: { store: Store; onOpenTask: (id: EntityId) => void }) {
  const { data } = store;
  const startOfWeek = data.settings.startOfWeek as 'Monday' | 'Sunday' | 'Saturday';
  const timeFormat = data.settings.timeFormat;
  const dateFormat = data.settings.dateFormat;
  const [mode, setMode] = useState<ViewMode>('Day');
  const [current, setCurrent] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [showEventModal, setShowEventModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [viewingEventId, setViewingEventId] = useState<EntityId | null>(null);
  const [editingEventId, setEditingEventId] = useState<EntityId | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(localISO(current));
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndTime, setEventEndTime] = useState('10:00');
  const [eventDescription, setEventDescription] = useState('');
  const [eventColor, setEventColor] = useState<TaskColor>('cyan');
  const [eventError, setEventError] = useState('');
  const [confirmEventDelete, setConfirmEventDelete] = useState(false);

  const allEvents: CalItem[] = [
    ...data.events.map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.startTime, color: e.color, isTask: false, description: e.description })),
    ...data.tasks.filter((t) => t.dueDate).map((t) => ({ id: `task-${t.id}`, title: t.title, date: t.dueDate!, time: '12:00', color: getListColor(t, data.lists), taskId: t.id, isTask: true })),
  ];

  const goPrev = () => { const d = new Date(current); if (mode === 'Day') d.setDate(d.getDate() - 1); else if (mode === 'Week') d.setDate(d.getDate() - 7); else d.setMonth(d.getMonth() - 1); setCurrent(d); };
  const goNext = () => { const d = new Date(current); if (mode === 'Day') d.setDate(d.getDate() + 1); else if (mode === 'Week') d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1); setCurrent(d); };
  const headingText = mode === 'Day' ? `${current.getDate()} ${monthNames[current.getMonth()]} ${current.getFullYear()}` : mode === 'Week' ? getWeekRange(current, startOfWeek) : `${monthNames[current.getMonth()]} ${current.getFullYear()}`;

  const viewingEvent = viewingEventId ? data.events.find((e) => e.id === viewingEventId) ?? null : null;

  const openAddEvent = () => {
    setEditingEventId(null); setViewingEventId(null); setIsEditing(true);
    setEventTitle(''); setEventDate(localISO(current)); setEventStartTime('09:00'); setEventEndTime('10:00'); setEventDescription(''); setEventColor('cyan');
    setEventError(''); setConfirmEventDelete(false); setShowEventModal(true);
  };
  const openViewEvent = (ev: CalendarEvent) => {
    setViewingEventId(ev.id); setEditingEventId(null); setIsEditing(false); setConfirmEventDelete(false); setShowEventModal(true);
  };
  const startEditEvent = () => {
    if (!viewingEvent) return;
    const ev = viewingEvent;
    setEditingEventId(ev.id); setIsEditing(true);
    setEventTitle(ev.title); setEventDate(ev.date); setEventStartTime(ev.startTime); setEventEndTime(ev.endTime); setEventDescription(ev.description); setEventColor(ev.color);
    setEventError(''); setConfirmEventDelete(false);
  };
  const saveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = eventTitle.trim().slice(0, LIMITS.EVENT_TITLE);
    if (!trimmed) return;
    if (eventEndTime && eventEndTime < eventStartTime) { setEventError('End time must be after start time.'); return; }
    setEventError('');
    if (editingEventId) { store.updateEvent(editingEventId, { title: trimmed, date: eventDate, startTime: eventStartTime, endTime: eventEndTime, description: eventDescription.slice(0, LIMITS.EVENT_DESCRIPTION), color: eventColor }); }
    else { store.addEvent({ title: trimmed, description: eventDescription.slice(0, LIMITS.EVENT_DESCRIPTION), date: eventDate, startTime: eventStartTime, endTime: eventEndTime, color: eventColor }); }
    setShowEventModal(false); setEditingEventId(null); setViewingEventId(null); setIsEditing(false);
  };
  const handleItemClick = (item: CalItem) => {
    if (item.isTask && item.taskId) onOpenTask(item.taskId);
    else { const ev = data.events.find((e) => e.id === item.id); if (ev) openViewEvent(ev); }
  };

  const closeModal = () => { setShowEventModal(false); setViewingEventId(null); setEditingEventId(null); setIsEditing(false); setConfirmEventDelete(false); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    if (showEventModal) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showEventModal]);

  return (
    <div className="view-content calendar-view">
      <div className="calendar-heading"><h1>{headingText}</h1><button className="outline-button" onClick={openAddEvent}><Plus size={16} />Add Event</button></div>
      <div className="calendar-controls">
        <div className="segmented">{(['Day', 'Week', 'Month'] as ViewMode[]).map((item) => <button className={mode === item ? 'selected' : ''} onClick={() => setMode(item)} key={item}>{item}</button>)}</div>
        <div><button className="icon-button" onClick={goPrev} aria-label="Previous"><ChevronLeft size={18} /></button><button className="icon-button" onClick={goNext} aria-label="Next"><ChevronRight size={18} /></button></div>
      </div>
      {mode === 'Day' && <DayView date={current} events={allEvents} onItemClick={handleItemClick} timeFormat={timeFormat} />}
      {mode === 'Week' && <WeekView date={current} events={allEvents} onItemClick={handleItemClick} startOfWeek={startOfWeek} timeFormat={timeFormat} />}
      {mode === 'Month' && <MonthView date={current} events={allEvents} onItemClick={handleItemClick} />}
      {showEventModal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="note-modal event-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" type="button" onClick={closeModal} aria-label="Close event"><X size={18} /></button>
            {!isEditing && viewingEvent ? (
              <>
                <h2 className="event-modal-title">{viewingEvent.title}</h2>
                <div className="detail-info-grid">
                  <div className="detail-info-item"><span>Date</span><strong>{formatDate(viewingEvent.date, dateFormat)}</strong></div>
                  <div className="detail-info-item"><span>Start</span><strong>{formatTime(viewingEvent.startTime, timeFormat)}</strong></div>
                  <div className="detail-info-item"><span>End</span><strong>{formatTime(viewingEvent.endTime, timeFormat)}</strong></div>
                  <div className="detail-info-item"><span>Color</span><strong><i className={`color-square ${viewingEvent.color}`} /></strong></div>
                </div>
                <div className="detail-section">
                  <span className="detail-section-label">Description</span>
                  <p className="note-detail-body">{viewingEvent.description || 'No description added.'}</p>
                </div>
                {confirmEventDelete ? (
                  <div className="confirm-row"><span>Delete this event?</span><button className="danger-btn" type="button" onClick={() => { store.deleteEvent(viewingEvent.id); closeModal(); }}>Delete</button><button className="outline-button small-btn" type="button" onClick={() => setConfirmEventDelete(false)}>Cancel</button></div>
                ) : (
                  <div className="note-modal-actions">
                    <button className="danger-btn-text" type="button" onClick={() => setConfirmEventDelete(true)} aria-label="Delete event"><Trash2 size={15} />Delete</button>
                    <div className="modal-actions-right">
                      <button className="outline-button small-btn" type="button" onClick={closeModal}>Close</button>
                      <button className="primary-button small-btn edit-btn" type="button" onClick={startEditEvent}><Pencil size={14} />Edit</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={saveEvent}>
                <h2 className="event-modal-title">{editingEventId ? 'Edit Event' : 'Add Event'}</h2>
                <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value.slice(0, LIMITS.EVENT_TITLE))} placeholder="Event title" required maxLength={LIMITS.EVENT_TITLE} aria-label="Event title" />
                <div className="modal-row">
                  <label className="modal-field"><span>Date</span><input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label>
                  <label className="modal-field"><span>Start time</span><input type="time" value={eventStartTime} onChange={(e) => setEventStartTime(e.target.value)} /></label>
                </div>
                <div className="modal-row">
                  <label className="modal-field"><span>End time</span><input type="time" value={eventEndTime} onChange={(e) => setEventEndTime(e.target.value)} /></label>
                  <label className="modal-field"><span>Color</span><div className="event-color-picker">{eventColors.map((c) => <button type="button" key={c} className={`color-square ${c} ${eventColor === c ? 'color-selected' : ''}`} onClick={() => setEventColor(c)} aria-label={`${c} color`} />)}</div></label>
                </div>
                <label className="modal-label">Description<textarea className="modal-textarea" value={eventDescription} onChange={(e) => setEventDescription(e.target.value.slice(0, LIMITS.EVENT_DESCRIPTION))} placeholder="Add a description..." maxLength={LIMITS.EVENT_DESCRIPTION} /></label>
                {eventError && <p className="auth-error">{eventError}</p>}
                {confirmEventDelete ? (
                  <div className="confirm-row"><span>Delete this event?</span><button className="danger-btn" type="button" onClick={() => { if (editingEventId) store.deleteEvent(editingEventId); closeModal(); }}>Delete</button><button className="outline-button small-btn" type="button" onClick={() => setConfirmEventDelete(false)}>Cancel</button></div>
                ) : (
                  <div className="modal-actions">
                    {editingEventId && <button className="danger-btn-text" type="button" onClick={() => setConfirmEventDelete(true)} aria-label="Delete event"><Trash2 size={15} />Delete</button>}
                    <div className="modal-actions-right"><button className="outline-button small-btn" type="button" onClick={closeModal}>Cancel</button><button className="primary-button small-btn edit-btn" type="submit">{editingEventId ? 'Save' : 'Add Event'}</button></div>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DayView({ date, events, onItemClick, timeFormat }: { date: Date; events: CalItem[]; onItemClick: (item: CalItem) => void; timeFormat: string }) {
  const dateStr = localISO(date);
  const dayEvents = events.filter((e) => e.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));
  const hours = timeFormat === '24-hour'
    ? ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']
    : ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'];
  return (
    <div className="calendar-grid">
      <div className="day-label">{dayNames[date.getDay()].toUpperCase()}</div>
      {hours.map((time, idx) => {
        const hourStr = String(9 + idx).padStart(2, '0');
        const slotEvents = dayEvents.filter((e) => e.time.startsWith(hourStr));
        return <div className="time-slot" key={time}><span>{time}</span><div className="slot-line" />{slotEvents.map((e) => <div key={e.id} className={`event ${colorClassMap[e.color] || 'event-cyan'}`} onClick={() => onItemClick(e)}>{e.title}</div>)}</div>;
      })}
    </div>
  );
}

function WeekView({ date, events, onItemClick, startOfWeek, timeFormat }: { date: Date; events: CalItem[]; onItemClick: (item: CalItem) => void; startOfWeek: 'Monday' | 'Sunday' | 'Saturday'; timeFormat: string }) {
  const start = getWeekStart(date, startOfWeek);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  return (
    <div className="week-grid">
      {days.map((d) => {
        const ds = localISO(d); const dayEvents = events.filter((e) => e.date === ds);
        return <div className="week-day" key={ds}><div className="week-day-head">{dayNames[d.getDay()]} {d.getDate()}</div><div className="week-day-body">{dayEvents.length === 0 ? <span className="week-empty">—</span> : dayEvents.map((e) => <div key={e.id} className={`event ${colorClassMap[e.color] || 'event-cyan'} week-event`} onClick={() => onItemClick(e)}>{formatTime(e.time, timeFormat)} {e.title}</div>)}</div></div>;
      })}
    </div>
  );
}

function MonthView({ date, events, onItemClick }: { date: Date; events: CalItem[]; onItemClick: (item: CalItem) => void }) {
  const year = date.getFullYear(); const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i));
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <div className="month-grid">
      {dayNames.map((d) => <div className="month-dow" key={d}>{d}</div>)}
      {cells.map((d, i) => {
        if (!d) return <div className="month-cell empty" key={i} />;
        const ds = localISO(d); const dayEvents = events.filter((e) => e.date === ds); const isToday = ds === todayStr();
        return <div className={`month-cell ${isToday ? 'month-today' : ''}`} key={i}><span className="month-date">{d.getDate()}</span>{dayEvents.slice(0, 3).map((e) => <div key={e.id} className={`event ${colorClassMap[e.color] || 'event-cyan'} month-event`} onClick={() => onItemClick(e)}>{e.title}</div>)}{dayEvents.length > 3 && <span className="month-more">+{dayEvents.length - 3} more</span>}</div>;
      })}
    </div>
  );
}

function getListColor(task: Task, lists: { id: EntityId; color: string }[]): string { const l = lists.find((l) => l.id === task.listId); return l?.color ?? 'cyan'; }
export default CalendarView;
