import { useMemo, useState, useEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import AuthShell from '@/components/AuthShell';
import Sidebar from '@/components/Sidebar';
import { TaskRow, AddTask, TaskModal } from '@/components/TaskViews';
import StickyWallView from '@/components/StickyWallView';
import CalendarView from '@/components/CalendarView';
import SettingsView from '@/components/SettingsView';
import ListsManagementView from '@/components/ListsManagementView';
import TagsManagementView from '@/components/TagsManagementView';
import type { EntityId, ListItem } from '@/types';
import { todayStr, tomorrowStr, dayOffsetStr } from '@/utils/format';

type AuthView = 'welcome' | 'signin' | 'signup';

function TodayView({ store, lists, onOpen }: { store: ReturnType<typeof useAppStore>; lists: ListItem[]; onOpen: (id: EntityId) => void }) {
  const { data } = store;
  const today = todayStr();
  const tasks = data.tasks.filter((t) => t.dueDate === today);
  const incomplete = tasks.filter((t) => !t.completed);
  return (
    <div className="view-content">
      <div className="view-heading"><div><h1>Today</h1><span className="count-badge">{incomplete.length}</span></div><button className="more-button" aria-label="More options"><MoreHorizontal size={20} /></button></div>
      <div className="today-list">
        <AddTask store={store} defaultDueDate={today} />
        {tasks.length === 0 && <div className="empty-state"><p>No tasks for today. Add one above to get started.</p></div>}
        {tasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
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
      <div className="upcoming-grid">
        <section className="task-card upcoming-section">
          <div className="section-header">
            <h2>Today</h2>
            <span className="count-badge">{todayTasks.filter(t => !t.completed).length}</span>
          </div>
          <AddTask store={store} defaultDueDate={today} />
          <div className="task-card-list">
            {todayTasks.length === 0 ? <div className="empty-state-card"><p>No tasks scheduled for today.</p></div> : todayTasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
          </div>
        </section>
        <section className="task-card upcoming-section">
          <div className="section-header">
            <h2>Tomorrow</h2>
            <span className="count-badge">{tomorrowTasks.filter(t => !t.completed).length}</span>
          </div>
          <AddTask store={store} defaultDueDate={tomorrow} />
          <div className="task-card-list">
            {tomorrowTasks.length === 0 ? <div className="empty-state-card"><p>No tasks scheduled for tomorrow.</p></div> : tomorrowTasks.map((task) => <TaskRow key={task.id} task={task} lists={lists} store={store} onOpen={onOpen} />)}
          </div>
        </section>
        <section className="task-card upcoming-section">
          <div className="section-header">
            <h2>This Week</h2>
            <span className="count-badge">{weekTasks.filter(t => !t.completed).length}</span>
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

function ListView({ store, listId, onOpen }: { store: ReturnType<typeof useAppStore>; listId: EntityId; onOpen: (id: EntityId) => void }) {
  const { data } = store;
  const list = data.lists.find((l) => l.id === listId);
  if (!list) return null;
  const tasks = data.tasks.filter((t) => t.listId === listId);
  const incomplete = tasks.filter((t) => !t.completed);
  return (
    <div className="view-content">
      <div className="view-heading"><div><h1>{list.label}</h1><span className="count-badge">{incomplete.length}</span></div><button className="more-button" aria-label="More options"><MoreHorizontal size={20} /></button></div>
      <div className="today-list">
        <AddTask store={store} defaultListId={listId} />
        {tasks.length === 0 && <div className="empty-state"><p>No tasks in this list yet. Add one above.</p></div>}
        {tasks.map((task) => <TaskRow key={task.id} task={task} lists={data.lists} store={store} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function TagView({ store, tagId, onOpen }: { store: ReturnType<typeof useAppStore>; tagId: EntityId; onOpen: (id: EntityId) => void }) {
  const { data } = store;
  const tag = data.tags.find((t) => t.id === tagId);
  if (!tag) return null;
  const tasks = data.tasks.filter((t) => t.tagIds.includes(tagId));
  const incomplete = tasks.filter((t) => !t.completed);
  return (
    <div className="view-content">
      <div className="view-heading"><div><h1>{tag.label}</h1><span className="count-badge">{incomplete.length}</span></div><button className="more-button" aria-label="More options"><MoreHorizontal size={20} /></button></div>
      <div className="today-list">
        <AddTask store={store} />
        {tasks.length === 0 && <div className="empty-state"><p>No tasks with this tag. Add a task and assign this tag.</p></div>}
        {tasks.map((task) => <TaskRow key={task.id} task={task} lists={data.lists} store={store} onOpen={onOpen} />)}
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
    if (page === 'Settings') return <SettingsView store={store} />;
    if (page === 'Lists Management') return <ListsManagementView store={store} onPage={setPage} />;
    if (page === 'Tags Management') return <TagsManagementView store={store} onPage={setPage} />;
    if (page.startsWith('list-')) { const id = page.slice(5); return <ListView store={store} listId={id} onOpen={openTask} />; }
    if (page.startsWith('tag-')) { const id = page.slice(4); return <TagView store={store} tagId={id} onOpen={openTask} />; }
    return null;
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

  if (store.data.session) return <Workspace store={store} />;
  return <AuthShell view={authView} onView={setAuthView} store={store} />;
}

export default App;
