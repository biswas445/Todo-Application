import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Task, Store, EntityId } from '@/store/useAppStore';
import type { CalendarEvent, TaskColor } from '@/types';
import { LIMITS } from '@/types';
import { localISO, formatTime, todayStr, formatDate } from '@/utils/format';

type ViewMode = 'Day' | 'Week' | 'Month';
type CalItem = { id: string; title: string; date: string; time: string; endTime: string; color: string; taskId?: EntityId; isTask: boolean; description?: string };

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

  // Derive calendar items from current state - no caching
  const allEvents: CalItem[] = useMemo(() => [
    ...data.events.map((e) => ({ id: `event-${e.id}`, title: e.title, date: e.date, time: e.startTime, endTime: e.endTime, color: e.color, isTask: false, description: e.description })),
    ...data.tasks.filter((t) => t.dueDate && !t.completed).map((t) => ({ id: `task-${t.id}`, title: t.title, date: t.dueDate!, time: '12:00', endTime: '13:00', color: getListColor(t, data.lists), taskId: t.id, isTask: true })),
  ], [data.events, data.tasks, data.lists]);

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
    else {
      // Extract event ID safely - only remove prefix if it exists
      const eventId = item.id.startsWith('event-') ? item.id.slice(6) : item.id;
      const ev = data.events.find((e) => e.id === eventId);
      if (ev) openViewEvent(ev);
    }
  };

  const handleDeleteEvent = (eventId: EntityId) => {
    store.deleteEvent(eventId);
    // Clear all modal state immediately after deletion to prevent stale display
    setShowEventModal(false);
    setViewingEventId(null);
    setEditingEventId(null);
    setIsEditing(false);
    setConfirmEventDelete(false);
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
      {mode === 'Month' && <MonthView date={current} events={allEvents} onItemClick={handleItemClick} timeFormat={timeFormat} startOfWeek={startOfWeek} />}
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
                  <div className="confirm-row"><span>Delete this event?</span><button className="danger-btn" type="button" onClick={() => handleDeleteEvent(viewingEvent.id)}><span>Delete</span></button><button className="outline-button small-btn" type="button" onClick={() => setConfirmEventDelete(false)}>Cancel</button></div>
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
                  <div className="confirm-row"><span>Delete this event?</span><button className="danger-btn" type="button" onClick={() => handleDeleteEvent(editingEventId!)}><span>Delete</span></button><button className="outline-button small-btn" type="button" onClick={() => setConfirmEventDelete(false)}>Cancel</button></div>
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
  // Same hour-grid stacking logic as Week view, just one column instead of seven.
  return <HourGrid columns={[buildColumn(date, events)]} timeFormat={timeFormat} onItemClick={onItemClick} emptyMessage="No events for this day." />;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

type HourGridColumn = { key: string; head: string; isToday: boolean; byHour: Map<number, CalItem[]> };

// Build one grid column (a single day) with its events grouped by start hour.
function buildColumn(d: Date, events: CalItem[]): HourGridColumn {
  const ds = localISO(d);
  const byHour = new Map<number, CalItem[]>();
  events.filter((e) => e.date === ds).forEach((e) => {
    const hour = Math.floor(toMinutes(e.time) / 60) * 60;
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour)!.push(e);
  });
  byHour.forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)));
  return { key: ds, head: `${dayNames[d.getDay()]} ${d.getDate()}`, isToday: ds === todayStr(), byHour };
}

// Shared hour-row grid used by both Day (1 column) and Week (7 columns) views.
// Same-time events stack vertically at full column width; each hour row expands to fit.
function HourGrid({ columns, timeFormat, onItemClick, emptyMessage }: { columns: HourGridColumn[]; timeFormat: string; onItemClick: (item: CalItem) => void; emptyMessage?: string }) {
  const starts: number[] = [];
  let totalEvents = 0;
  columns.forEach((col) => col.byHour.forEach((list, hour) => { starts.push(hour); totalEvents += list.length; }));
  let gridStart: number; let gridEnd: number;
  if (starts.length === 0) { gridStart = 9 * 60; gridEnd = 17 * 60; }
  else {
    gridStart = Math.min(...starts);
    gridEnd = Math.max(...starts) + 60;
  }
  if (gridEnd - gridStart < 8 * 60) gridEnd = gridStart + 8 * 60;
  gridStart = Math.max(0, gridStart);
  gridEnd = Math.min(24 * 60, gridEnd);
  if (gridEnd <= gridStart) gridEnd = Math.min(24 * 60, gridStart + 8 * 60);

  const hourRows: number[] = [];
  for (let m = gridStart; m < gridEnd; m += 60) hourRows.push(m);
  const hourLabel = (min: number) => formatTime(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, timeFormat);
  const gridCols = `56px repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div className="week-tg">
      <div className="week-tg-head" style={{ gridTemplateColumns: gridCols }}>
        <div className="week-tg-corner" />
        {columns.map((col) => (
          <div key={col.key} className={`week-tg-day-head ${col.isToday ? 'week-tg-today' : ''}`}>{col.head}</div>
        ))}
      </div>
      {hourRows.map((hourMin, rowIdx) => (
        <div className="week-row" key={hourMin} style={{ gridTemplateColumns: gridCols }}>
          <div className="week-row-gutter">{hourLabel(hourMin)}</div>
          {columns.map((col, colIdx) => {
            const cellEvents = col.byHour.get(hourMin) || [];
            return (
              <div key={col.key} className={`week-cell ${col.isToday ? 'week-cell-today' : ''}`}>
                {rowIdx === 0 && colIdx === 0 && totalEvents === 0 && emptyMessage && <div className="hour-grid-empty">{emptyMessage}</div>}
                {cellEvents.map((e) => (
                  <div key={e.id} className={`event ${colorClassMap[e.color] || 'event-cyan'} week-stack-event`} onClick={() => onItemClick(e)}>
                    <span className="week-tg-event-title">{e.title}</span>
                    <span className="week-tg-event-time">{formatTime(e.time, timeFormat)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function WeekView({ date, events, onItemClick, startOfWeek, timeFormat }: { date: Date; events: CalItem[]; onItemClick: (item: CalItem) => void; startOfWeek: 'Monday' | 'Sunday' | 'Saturday'; timeFormat: string }) {
  const start = getWeekStart(date, startOfWeek);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  return <HourGrid columns={days.map((d) => buildColumn(d, events))} timeFormat={timeFormat} onItemClick={onItemClick} />;
}

function MonthView({ date, events, onItemClick, timeFormat, startOfWeek }: { date: Date; events: CalItem[]; onItemClick: (item: CalItem) => void; timeFormat: string; startOfWeek: 'Monday' | 'Sunday' | 'Saturday' }) {
  const year = date.getFullYear(); const month = date.getMonth();
  // Align the grid with the user's start-of-week setting (Week view already
  // does this via getWeekStart; month view used to be hardcoded Sunday-first).
  const offsetMap = { Sunday: 0, Monday: 1, Saturday: 6 };
  const offset = offsetMap[startOfWeek];
  const orderedDayNames = Array.from({ length: 7 }, (_, i) => dayNames[(offset + i) % 7]);
  const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < (firstDay - offset + 7) % 7; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i));
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <div className="month-grid">
      {orderedDayNames.map((d) => <div className="month-dow" key={d}>{d}</div>)}
      {cells.map((d, i) => {
        if (!d) return <div className="month-cell empty" key={i} />;
        const ds = localISO(d); const dayEvents = events.filter((e) => e.date === ds); const isToday = ds === todayStr();
        return (
          <div className={`month-cell ${isToday ? 'month-today' : ''}`} key={i}>
            <span className="month-date">{d.getDate()}</span>
            {dayEvents.slice(0, 3).map((e) => (
              <div key={e.id} className={`event ${colorClassMap[e.color] || 'event-cyan'} month-event`} onClick={() => onItemClick(e)}>
                <span className="month-event-title">{e.title}</span>
                <span className="month-event-time">{formatTime(e.time, timeFormat)}</span>
              </div>
            ))}
            {dayEvents.length > 3 && <span className="month-more">+{dayEvents.length - 3} more</span>}
          </div>
        );
      })}
    </div>
  );
}

function getListColor(task: Task, lists: { id: EntityId; color: string }[]): string { const l = lists.find((l) => l.id === task.listId); return l?.color ?? 'cyan'; }
export default CalendarView;
