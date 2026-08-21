import { useMemo, useState, useEffect, useRef } from 'react';
import { CheckSquare, Check, AlertCircle, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useWebSocketNotifications } from '@/hooks/useWebSocketNotifications';
import type { ApiTask, ApiNote, ApiEvent, ApiNotification } from '@/api';
import AuthShell from '@/components/AuthShell';
import Sidebar from '@/components/Sidebar';
import { TaskRow, AddTask, TaskModal } from '@/components/TaskViews';
import StickyWallView from '@/components/StickyWallView';
import CalendarView from '@/components/CalendarView';
import SettingsView from '@/components/SettingsView';
import ListsManagementView from '@/components/ListsManagementView';
import TagsManagementView from '@/components/TagsManagementView';
import NotificationsView from '@/components/NotificationsView';
import NotFound from '@/components/NotFound';
import type { EntityId, ListItem } from '@/types';
import { todayStr, tomorrowStr, dayOffsetStr } from '@/utils/format';

type AuthView = 'welcome' | 'signin' | 'signup';

function TodayView({ store, lists, onOpen }: { store: ReturnType<typeof useAppStore>; lists: ListItem[]; onOpen: (id: EntityId) => void }) {
  const { data } = store;
  const today = todayStr();
  const tasks = data.tasks.filter((t) => t.dueDate === today && !t.completed);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<EntityId>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleSelection = (taskId: EntityId) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectedTaskIds(new Set());
    setConfirmingDelete(false);
    setIsSelectionMode(false);
  };

  const deleteSelected = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      // Await all deletes so failures surface before the selection is
      // cleared; deleteTask reports per-item errors to the store.
      await Promise.all(Array.from(selectedTaskIds).map((id) => store.deleteTask(id)));
      exitSelectionMode();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="view-content">
      <div className="view-heading">
        <div><h1>Today</h1><span className="count-badge">{tasks.length}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSelectionMode ? (
            confirmingDelete ? (
              <>
                <span style={{ fontSize: 13, alignSelf: 'center' }}>Delete {selectedTaskIds.size} task{selectedTaskIds.size === 1 ? '' : 's'}?</span>
                <button className="danger-btn small-btn" onClick={deleteSelected} disabled={isDeleting}>{isDeleting ? 'Deleting...' : 'Delete'}</button>
                <button className="outline-button small-btn" onClick={() => setConfirmingDelete(false)} disabled={isDeleting}>Cancel</button>
              </>
            ) : (
              <>
                <button className="outline-button small-btn" onClick={exitSelectionMode}>Cancel</button>
                {selectedTaskIds.size > 0 && (
                  <button className="danger-btn small-btn" onClick={() => setConfirmingDelete(true)}>Delete ({selectedTaskIds.size})</button>
                )}
              </>
            )
          ) : (
            <button className="more-button" aria-label="More options" onClick={() => setIsSelectionMode(true)}>
              <CheckSquare size={20} />
            </button>
          )}
        </div>
      </div>
      <div className="today-list">
        <AddTask store={store} defaultDueDate={today} />
        {tasks.length === 0 && <div className="empty-state"><p>No tasks for today. Add one above to get started.</p></div>}
        {tasks.map((task) => (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isSelectionMode && (
              <button
                type="button"
                className={`checkbox select-check ${selectedTaskIds.has(task.id) ? 'checked' : ''}`}
                onClick={() => toggleSelection(task.id)}
                aria-label={selectedTaskIds.has(task.id) ? 'Deselect task' : 'Select task'}
              >
                {selectedTaskIds.has(task.id) && <Check size={12} />}
              </button>
            )}
            <TaskRow task={task} lists={lists} store={store} onOpen={onOpen} hideCheckbox={isSelectionMode} />
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingView({ store, lists, onOpen }: { store: ReturnType<typeof useAppStore>; lists: ListItem[]; onOpen: (id: EntityId) => void }) {
  const { data } = store;
  const today = todayStr();
  const tomorrow = tomorrowStr();
  const weekEnd = dayOffsetStr(7);

  const todayTasks = data.tasks.filter((t) => t.dueDate === today && !t.completed);
  const tomorrowTasks = data.tasks.filter((t) => t.dueDate === tomorrow && !t.completed);
  const weekTasks = data.tasks.filter((t) => t.dueDate && t.dueDate > tomorrow && t.dueDate <= weekEnd && !t.completed);
  const total = data.tasks.filter((t) => t.dueDate && !t.completed).length;

  return (
    <div className="view-content upcoming-view">
      <div className="view-heading"><div><h1>Upcoming</h1><span className="count-badge">{total}</span></div></div>
      
      {/* Horizontal Grid Layout: Today | Tomorrow | This Week */}
      <div className="upcoming-grid">

        {/* Today Section */}
        <section className="task-card upcoming-section">
          <div className="section-header">
            <h2>Today</h2>
            <span className="count-badge">{todayTasks.length}</span>
          </div>
          <AddTask store={store} defaultDueDate={today} />
          <div className="task-card-list">
            {todayTasks.length === 0 ? <div className="empty-state-card"><p>No tasks scheduled for today.</p></div> : todayTasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
          </div>
        </section>

        {/* Tomorrow Section */}
        <section className="task-card upcoming-section">
          <div className="section-header">
            <h2>Tomorrow</h2>
            <span className="count-badge">{tomorrowTasks.length}</span>
          </div>
          <AddTask store={store} defaultDueDate={tomorrow} />
          <div className="task-card-list">
            {tomorrowTasks.length === 0 ? <div className="empty-state-card"><p>No tasks scheduled for tomorrow.</p></div> : tomorrowTasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
          </div>
        </section>

        {/* This Week Section */}
        <section className="task-card upcoming-section">
          <div className="section-header">
            <h2>This Week</h2>
            <span className="count-badge">{weekTasks.length}</span>
          </div>
          <AddTask store={store} defaultDueDate={weekEnd} />
          <div className="task-card-list">
            {weekTasks.length === 0 ? <div className="empty-state-card"><p>No tasks scheduled for this week.</p></div> : weekTasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
          </div>
        </section>

      </div>
    </div>
  );
}

function CompleteTasksView({ store, lists, onOpen }: { store: ReturnType<typeof useAppStore>; lists: ListItem[]; onOpen: (id: EntityId) => void }) {
  const { data } = store;
  const completedTasks = data.tasks.filter((t) => t.completed);

  return (
    <div className="view-content">
      <div className="view-heading">
        <div><h1>Complete Tasks</h1><span className="count-badge">{completedTasks.length}</span></div>
      </div>
      <div className="today-list">
        {completedTasks.length === 0 && <div className="empty-state"><p>No completed tasks yet. Check off a task and it will appear here.</p></div>}
        {completedTasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function ListView({ store, listId, onOpen, onGoHome }: { store: ReturnType<typeof useAppStore>; listId: EntityId; onOpen: (id: EntityId) => void; onGoHome: () => void }) {
  const { data } = store;
  const list = data.lists.find((l) => l.id === listId);
  const tasks = data.tasks.filter((t) => t.listId === listId);
  const incomplete = tasks.filter((t) => !t.completed);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<EntityId>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!list) return <NotFound onGoHome={onGoHome} />;

  const toggleSelection = (taskId: EntityId) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectedTaskIds(new Set());
    setConfirmingDelete(false);
    setIsSelectionMode(false);
  };

  const deleteSelected = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await Promise.all(Array.from(selectedTaskIds).map((id) => store.deleteTask(id)));
      exitSelectionMode();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="view-content">
      <div className="view-heading">
        <div><h1>{list.label}</h1><span className="count-badge">{incomplete.length}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSelectionMode ? (
            confirmingDelete ? (
              <>
                <span style={{ fontSize: 13, alignSelf: 'center' }}>Delete {selectedTaskIds.size} task{selectedTaskIds.size === 1 ? '' : 's'}?</span>
                <button className="danger-btn small-btn" onClick={deleteSelected} disabled={isDeleting}>{isDeleting ? 'Deleting...' : 'Delete'}</button>
                <button className="outline-button small-btn" onClick={() => setConfirmingDelete(false)} disabled={isDeleting}>Cancel</button>
              </>
            ) : (
              <>
                <button className="outline-button small-btn" onClick={exitSelectionMode}>Cancel</button>
                {selectedTaskIds.size > 0 && (
                  <button className="danger-btn small-btn" onClick={() => setConfirmingDelete(true)}>Delete ({selectedTaskIds.size})</button>
                )}
              </>
            )
          ) : (
            <button className="more-button" aria-label="More options" onClick={() => setIsSelectionMode(true)}>
              <CheckSquare size={20} />
            </button>
          )}
        </div>
      </div>
      <div className="today-list">
        <AddTask store={store} defaultListId={listId} />
        {tasks.length === 0 && <div className="empty-state"><p>No tasks in this list yet. Add one above.</p></div>}
        {tasks.map((task) => (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isSelectionMode && (
              <button
                type="button"
                className={`checkbox select-check ${selectedTaskIds.has(task.id) ? 'checked' : ''}`}
                onClick={() => toggleSelection(task.id)}
                aria-label={selectedTaskIds.has(task.id) ? 'Deselect task' : 'Select task'}
              >
                {selectedTaskIds.has(task.id) && <Check size={12} />}
              </button>
            )}
            <TaskRow task={task} lists={data.lists} store={store} onOpen={onOpen} hideCheckbox={isSelectionMode} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TagView({ store, tagId, onOpen, onGoHome }: { store: ReturnType<typeof useAppStore>; tagId: EntityId; onOpen: (id: EntityId) => void; onGoHome: () => void }) {
  const { data } = store;
  const tag = data.tags.find((t) => t.id === tagId);
  const tasks = data.tasks.filter((t) => t.tagIds.includes(tagId));
  const incomplete = tasks.filter((t) => !t.completed);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<EntityId>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!tag) return <NotFound onGoHome={onGoHome} />;

  const toggleSelection = (taskId: EntityId) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectedTaskIds(new Set());
    setConfirmingDelete(false);
    setIsSelectionMode(false);
  };

  const deleteSelected = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await Promise.all(Array.from(selectedTaskIds).map((id) => store.deleteTask(id)));
      exitSelectionMode();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="view-content">
      <div className="view-heading">
        <div><h1>{tag.label}</h1><span className="count-badge">{incomplete.length}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSelectionMode ? (
            confirmingDelete ? (
              <>
                <span style={{ fontSize: 13, alignSelf: 'center' }}>Delete {selectedTaskIds.size} task{selectedTaskIds.size === 1 ? '' : 's'}?</span>
                <button className="danger-btn small-btn" onClick={deleteSelected} disabled={isDeleting}>{isDeleting ? 'Deleting...' : 'Delete'}</button>
                <button className="outline-button small-btn" onClick={() => setConfirmingDelete(false)} disabled={isDeleting}>Cancel</button>
              </>
            ) : (
              <>
                <button className="outline-button small-btn" onClick={exitSelectionMode}>Cancel</button>
                {selectedTaskIds.size > 0 && (
                  <button className="danger-btn small-btn" onClick={() => setConfirmingDelete(true)}>Delete ({selectedTaskIds.size})</button>
                )}
              </>
            )
          ) : (
            <button className="more-button" aria-label="More options" onClick={() => setIsSelectionMode(true)}>
              <CheckSquare size={20} />
            </button>
          )}
        </div>
      </div>
      <div className="today-list">
        <AddTask store={store} />
        {tasks.length === 0 && <div className="empty-state"><p>No tasks with this tag. Add a task and assign this tag.</p></div>}
        {tasks.map((task) => (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isSelectionMode && (
              <button
                type="button"
                className={`checkbox select-check ${selectedTaskIds.has(task.id) ? 'checked' : ''}`}
                onClick={() => toggleSelection(task.id)}
                aria-label={selectedTaskIds.has(task.id) ? 'Deselect task' : 'Select task'}
              >
                {selectedTaskIds.has(task.id) && <Check size={12} />}
              </button>
            )}
            <TaskRow task={task} lists={data.lists} store={store} onOpen={onOpen} hideCheckbox={isSelectionMode} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Workspace({ store }: { store: ReturnType<typeof useAppStore> }) {
  const [page, setPage] = useState('Today');
  const [selectedTaskId, setSelectedTaskId] = useState<EntityId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Real-time sync: apply changes broadcast by the backend over WebSocket.
  // Object payloads are upserted directly; list/tag mutations and note/event
  // updates/deletes (which carry no payload) trigger a collection refresh.
  useWebSocketNotifications({
    onTaskCreated: (task) => { if (task) store.applyExternalTask(task as ApiTask); },
    onTaskUpdated: (task) => { if (task) store.applyExternalTask(task as ApiTask); },
    onTaskDeleted: (data) => {
      const id = (data as { object?: { id?: EntityId } } | undefined)?.object?.id;
      if (id) store.removeExternalTask(id);
    },
    onNoteCreated: (note) => { if (note) store.applyExternalNote(note as ApiNote); },
    onEventCreated: (event) => { if (event) store.applyExternalEvent(event as ApiEvent); },
    onNotification: (data) => {
      switch (data?.type) {
        case 'list_created':
        case 'list_deleted':
          store.refreshCollection('lists');
          break;
        case 'tag_created':
        case 'tag_deleted':
          store.refreshCollection('tags');
          break;
        case 'note_updated':
        case 'note_deleted':
          store.refreshCollection('notes');
          break;
        case 'event_updated':
        case 'event_deleted':
          store.refreshCollection('events');
          break;
        case 'notification_created': {
          const notification = (data as { object?: ApiNotification }).object;
          if (notification) store.applyExternalNotification(notification);
          break;
        }
      }
    },
  });

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return store.data.tasks.filter((t) => {
      const list = store.data.lists.find((l) => l.id === t.listId);
      const tagLabels = t.tagIds.map((id) => store.data.tags.find((tag) => tag.id === id)?.label ?? '').filter(Boolean);
      return t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (list?.label.toLowerCase().includes(q) ?? false) ||
        tagLabels.some((tl) => tl.toLowerCase().includes(q));
    }).map((t) => t.id);
  }, [searchQuery, store.data]);

  const openTask = (id: EntityId) => setSelectedTaskId(id);
  const clearSearch = () => setSearchQuery('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const renderPage = () => {
    if (searchQuery.trim()) {
      const found = store.data.tasks.filter((t) => searchResults.includes(t.id));
      return (
        <div className="view-content">
          <div className="view-heading"><div><h1>Search Results</h1><span className="count-badge">{found.length}</span></div></div>
          <div className="today-list">
            {found.length === 0 ? <div className="empty-state"><p>No tasks found matching "{searchQuery}"</p></div> : found.map((task) => <TaskRow key={task.id} task={task} lists={store.data.lists} store={store} onOpen={openTask} />)}
          </div>
        </div>
      );
    }
    if (page === 'Today') return <TodayView store={store} lists={store.data.lists} onOpen={openTask} />;
    if (page === 'Upcoming') return <UpcomingView store={store} lists={store.data.lists} onOpen={openTask} />;
    if (page === 'Calendar') return <CalendarView store={store} onOpenTask={openTask} />;
    if (page === 'Sticky Wall') return <StickyWallView store={store} />;
    if (page === 'Notifications') return <NotificationsView store={store} />;
    if (page === 'Complete Tasks') return <CompleteTasksView store={store} lists={store.data.lists} onOpen={openTask} />;
    if (page === 'Settings') return <SettingsView store={store} />;
    if (page === 'Lists Management') return <ListsManagementView store={store} onPage={setPage} />;
    if (page === 'Tags Management') return <TagsManagementView store={store} onPage={setPage} />;
    if (page.startsWith('list-')) { const id = page.slice(5); return <ListView store={store} listId={id} onOpen={openTask} onGoHome={() => setPage('Today')} />; }
    if (page.startsWith('tag-')) { const id = page.slice(4); return <TagView store={store} tagId={id} onOpen={openTask} onGoHome={() => setPage('Today')} />; }
    return <NotFound onGoHome={() => setPage('Today')} />;
  };

  return (
    <main className="workspace">
      <Sidebar page={page} onPage={setPage} store={store} searchQuery={searchQuery} onSearch={setSearchQuery} onClearSearch={clearSearch} searchInputRef={searchInputRef} />
      <section className="workspace-main">
        {renderPage()}
      </section>
      <TaskModal selectedTaskId={selectedTaskId} lists={store.data.lists} tags={store.data.tags} store={store} onClose={() => setSelectedTaskId(null)} />
    </main>
  );
}

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  // Auto-dismiss so a stale banner does not linger, but keep a manual close so
  // the user can clear it immediately.
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className="error-toast" role="alert">
      <AlertCircle size={16} />
      <span className="error-toast-message">{message}</span>
      <button type="button" className="error-toast-close" onClick={onDismiss} aria-label="Dismiss error">
        <X size={14} />
      </button>
    </div>
  );
}

function App() {
  const store = useAppStore();
  const [authView, setAuthView] = useState<AuthView>('welcome');

  // Surface store-level errors (failed saves, expired session, load failures)
  // as a global toast across both the auth and workspace screens.
  const errorToast = store.error ? (
    <ErrorToast message={store.error} onDismiss={store.clearError} />
  ) : null;

  // Show loading state during initial auth check
  if (store.loading) {
    return (
      <div className="auth-page">
        <section className="auth-panel brand-panel">
          <div className="brand-lockup">Organic<br />Mind</div>
        </section>
        <section className="auth-panel auth-form-panel">
          <div className="auth-copy" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
            <p>Loading...</p>
          </div>
        </section>
      </div>
    );
  }

  if (store.data.session) {
    return (
      <>
        {errorToast}
        <Workspace store={store} />
      </>
    );
  }
  return (
    <>
      {errorToast}
      <AuthShell view={authView} onView={setAuthView} store={store} />
    </>
  );
}

export default App;
