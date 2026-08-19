import { useMemo, useState, useEffect, useRef } from 'react';
import { MoreHorizontal, CheckSquare } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
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
  const tasks = data.tasks.filter((t) => t.dueDate === today);
  const incomplete = tasks.filter((t) => !t.completed);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<EntityId>>(new Set());
  
  const toggleSelection = (taskId: EntityId) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  
  const deleteSelected = () => {
    selectedTaskIds.forEach(id => store.deleteTask(id));
    setSelectedTaskIds(new Set());
    setIsSelectionMode(false);
  };
  
  return (
    <div className="view-content">
      <div className="view-heading">
        <div><h1>Today</h1><span className="count-badge">{incomplete.length}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSelectionMode ? (
            <>
              <button className="outline-button small-btn" onClick={() => { setIsSelectionMode(false); setSelectedTaskIds(new Set()); }}>Cancel</button>
              {selectedTaskIds.size > 0 && (
                <button className="danger-btn small-btn" onClick={deleteSelected}>Delete ({selectedTaskIds.size})</button>
              )}
            </>
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
              <input
                type="checkbox"
                checked={selectedTaskIds.has(task.id)}
                onChange={() => toggleSelection(task.id)}
                style={{ marginRight: '8px' }}
              />
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

  const todayTasks = data.tasks.filter((t) => t.dueDate === today);
  const tomorrowTasks = data.tasks.filter((t) => t.dueDate === tomorrow);
  const weekTasks = data.tasks.filter((t) => t.dueDate && t.dueDate > tomorrow && t.dueDate <= weekEnd);
  const total = data.tasks.filter((t) => t.dueDate && !t.completed).length;

  return (
    <div className="view-content upcoming-view">
      <div className="view-heading"><div><h1>Upcoming</h1><span className="count-badge">{total}</span></div><button className="more-button" aria-label="More options"><MoreHorizontal size={20} /></button></div>
      
      {/* Horizontal Grid Layout: Today | Tomorrow | This Week */}
      <div className="upcoming-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '24px',
        width: '100%',
        marginTop: '24px'
      }}>
        
        {/* Today Section */}
        <section className="task-card upcoming-section" style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '400px'
        }}>
          <div className="section-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: 0 }}>Today</h2>
            <span className="count-badge" style={{
              background: '#eff6ff',
              color: '#2563eb',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '600'
            }}>{todayTasks.filter(t => !t.completed).length}</span>
          </div>
          <AddTask store={store} defaultDueDate={today} />
          <div className="task-card-list" style={{ flex: 1, marginTop: '16px' }}>
            {todayTasks.length === 0 ? <div className="empty-state-card"><p>No tasks scheduled for today.</p></div> : todayTasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
          </div>
        </section>

        {/* Tomorrow Section */}
        <section className="task-card upcoming-section" style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '400px'
        }}>
          <div className="section-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: 0 }}>Tomorrow</h2>
            <span className="count-badge" style={{
              background: '#eff6ff',
              color: '#2563eb',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '600'
            }}>{tomorrowTasks.filter(t => !t.completed).length}</span>
          </div>
          <AddTask store={store} defaultDueDate={tomorrow} />
          <div className="task-card-list" style={{ flex: 1, marginTop: '16px' }}>
            {tomorrowTasks.length === 0 ? <div className="empty-state-card"><p>No tasks scheduled for tomorrow.</p></div> : tomorrowTasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
          </div>
        </section>

        {/* This Week Section */}
        <section className="task-card upcoming-section" style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '400px'
        }}>
          <div className="section-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: 0 }}>This Week</h2>
            <span className="count-badge" style={{
              background: '#eff6ff',
              color: '#2563eb',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '600'
            }}>{weekTasks.filter(t => !t.completed).length}</span>
          </div>
          <AddTask store={store} defaultDueDate={weekEnd} />
          <div className="task-card-list" style={{ flex: 1, marginTop: '16px' }}>
            {weekTasks.length === 0 ? <div className="empty-state-card"><p>No tasks scheduled for this week.</p></div> : weekTasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
          </div>
        </section>

      </div>
    </div>
  );
}

function ListView({ store, listId, onOpen }: { store: ReturnType<typeof useAppStore>; listId: EntityId; onOpen: (id: EntityId) => void }) {
  const { data } = store;
  const list = data.lists.find((l) => l.id === listId);
  const tasks = data.tasks.filter((t) => t.listId === listId);
  const incomplete = tasks.filter((t) => !t.completed);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<EntityId>>(new Set());
  
  if (!list) return <NotFound />;
  
  const toggleSelection = (taskId: EntityId) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  
  const deleteSelected = () => {
    selectedTaskIds.forEach(id => store.deleteTask(id));
    setSelectedTaskIds(new Set());
    setIsSelectionMode(false);
  };
  
  return (
    <div className="view-content">
      <div className="view-heading">
        <div><h1>{list.label}</h1><span className="count-badge">{incomplete.length}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSelectionMode ? (
            <>
              <button className="outline-button small-btn" onClick={() => { setIsSelectionMode(false); setSelectedTaskIds(new Set()); }}>Cancel</button>
              {selectedTaskIds.size > 0 && (
                <button className="danger-btn small-btn" onClick={deleteSelected}>Delete ({selectedTaskIds.size})</button>
              )}
            </>
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
              <input
                type="checkbox"
                checked={selectedTaskIds.has(task.id)}
                onChange={() => toggleSelection(task.id)}
                style={{ marginRight: '8px' }}
              />
            )}
            <TaskRow task={task} lists={data.lists} store={store} onOpen={onOpen} hideCheckbox={isSelectionMode} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TagView({ store, tagId, onOpen }: { store: ReturnType<typeof useAppStore>; tagId: EntityId; onOpen: (id: EntityId) => void }) {
  const { data } = store;
  const tag = data.tags.find((t) => t.id === tagId);
  const tasks = data.tasks.filter((t) => t.tagIds.includes(tagId));
  const incomplete = tasks.filter((t) => !t.completed);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<EntityId>>(new Set());
  
  if (!tag) return <NotFound />;
  
  const toggleSelection = (taskId: EntityId) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  
  const deleteSelected = () => {
    selectedTaskIds.forEach(id => store.deleteTask(id));
    setSelectedTaskIds(new Set());
    setIsSelectionMode(false);
  };
  
  return (
    <div className="view-content">
      <div className="view-heading">
        <div><h1>{tag.label}</h1><span className="count-badge">{incomplete.length}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSelectionMode ? (
            <>
              <button className="outline-button small-btn" onClick={() => { setIsSelectionMode(false); setSelectedTaskIds(new Set()); }}>Cancel</button>
              {selectedTaskIds.size > 0 && (
                <button className="danger-btn small-btn" onClick={deleteSelected}>Delete ({selectedTaskIds.size})</button>
              )}
            </>
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
              <input
                type="checkbox"
                checked={selectedTaskIds.has(task.id)}
                onChange={() => toggleSelection(task.id)}
                style={{ marginRight: '8px' }}
              />
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
    if (page === 'Settings') return <SettingsView store={store} />;
    if (page === 'Lists Management') return <ListsManagementView store={store} onPage={setPage} />;
    if (page === 'Tags Management') return <TagsManagementView store={store} onPage={setPage} />;
    if (page.startsWith('list-')) { const id = page.slice(5); return <ListView store={store} listId={id} onOpen={openTask} />; }
    if (page.startsWith('tag-')) { const id = page.slice(4); return <TagView store={store} tagId={id} onOpen={openTask} />; }
    return <NotFound />;
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

function App() {
  const store = useAppStore();
  const [authView, setAuthView] = useState<AuthView>('welcome');

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

  if (store.data.session) return <Workspace store={store} />;
  return <AuthShell view={authView} onView={setAuthView} store={store} />;
}

export default App;
