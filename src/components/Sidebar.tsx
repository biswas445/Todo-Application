import { type RefObject } from 'react';
import { ArrowLeft, ArrowRight, Bell, CalendarDays, FileText, List, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Store } from '@/store/useAppStore';
import { todayStr } from '@/utils/format';

type Props = {
  page: string; onPage: (p: string) => void; store: Store;
  searchQuery: string; onSearch: (q: string) => void; onClearSearch: () => void;
  searchInputRef?: RefObject<HTMLInputElement>;
};

export function Sidebar({ page, onPage, store, searchQuery, onSearch, onClearSearch, searchInputRef }: Props) {
  const { data } = store;

  const todayCount = data.tasks.filter((t) => t.dueDate === todayStr() && !t.completed).length;
  const upcomingCount = data.tasks.filter((t) => t.dueDate && !t.completed).length;
  const calendarCount = data.events.length + data.tasks.filter((t) => t.dueDate && !t.completed).length;
  const stickyWallCount = data.notes.length;

  const nav = (target: string) => { onPage(target); };

  return (
    <aside className="sidebar">
      <div className="sidebar-head"><h2>Menu</h2></div>
        <div className="search-box"><Search size={16} /><input ref={searchInputRef} placeholder="Search" value={searchQuery} onChange={(e) => onSearch(e.target.value)} aria-label="Search tasks" />{searchQuery && <button className="search-clear" onClick={onClearSearch} aria-label="Clear search"><X size={14} /></button>}</div>

        <p className="side-label">TASKS</p>
        <nav className="side-nav">
          <button className={page === 'Upcoming' ? 'active' : ''} onClick={() => nav('Upcoming')}><ArrowRight size={16} /><span>Upcoming</span>{upcomingCount > 0 && <small>{upcomingCount}</small>}</button>
          <button className={page === 'Today' ? 'active' : ''} onClick={() => nav('Today')}><List size={16} /><span>Today</span>{todayCount > 0 && <small>{todayCount}</small>}</button>
          <button className={page === 'Calendar' ? 'active' : ''} onClick={() => nav('Calendar')}><CalendarDays size={16} /><span>Calendar</span>{calendarCount > 0 && <small>{calendarCount}</small>}</button>
          <button className={page === 'Sticky Wall' ? 'active' : ''} onClick={() => nav('Sticky Wall')}><FileText size={16} /><span>Sticky Wall</span>{stickyWallCount > 0 && <small>{stickyWallCount}</small>}</button>
        </nav>

        <div className="side-section">
          <button className={page === 'Notifications' ? 'active' : ''} onClick={() => nav('Notifications')}><Bell size={16} /><span>Notifications</span>{data.notifications.length > 0 && <small>{data.notifications.length}</small>}</button>
        </div>

        <div className="side-section lists">
          <p className="side-label">LISTS</p>
          {data.lists.map((list) => {
            const count = data.tasks.filter((t) => t.listId === list.id && !t.completed).length;
            return (
              <div key={list.id} className={`side-link-row ${page === `list-${list.id}` ? 'active' : ''}`}>
                <button className="side-link-inner" onClick={() => nav(`list-${list.id}`)} title={list.label}>
                  <i className={`color-square ${list.color}`} /><span className="side-link-label">{list.label}</span> <small>{count}</small>
                </button>
              </div>
            );
          })}
          <div className="sidebar-more-row">
            <button className="sidebar-more-btn" onClick={() => nav('Lists Management')}>+ Add New List</button>
          </div>
        </div>

        <div className="side-section tags">
          <p className="side-label">TAGS</p>
          <div className="tag-list-wrap">
            {data.tags.map((tag) => {
              const count = data.tasks.filter((t) => t.tagIds.includes(tag.id) && !t.completed).length;
              const tagClassMap: Record<string, string> = { cyan: 'cyan-tag', coral: 'coral-tag', yellow: 'yellow-tag', green: 'green-tag', blue: 'blue-tag' };
              return (
                <div key={tag.id} className={`tag-row ${page === `tag-${tag.id}` ? 'tag-active' : ''}`}>
                  <button className={`tag ${tagClassMap[tag.color]} tag-inner`} onClick={() => nav(`tag-${tag.id}`)} title={tag.label}>
                    <span className="tag-label">{tag.label}</span>{count > 0 && <span className="tag-count">{count}</span>}
                  </button>
                </div>
              );
            })}
          </div>
          <button className="sidebar-more-btn sidebar-show-tags" onClick={() => nav('Tags Management')}>+ Add Tags</button>
        </div>

        <div className="sidebar-bottom">
          <button className={`side-link ${page === 'Settings' ? 'active' : ''}`} onClick={() => nav('Settings')}><SlidersHorizontal size={16} />Settings</button>
          <button className="side-link" onClick={store.signOut}><ArrowLeft size={16} />Sign out</button>
        </div>
    </aside>
  );
}
export default Sidebar;
