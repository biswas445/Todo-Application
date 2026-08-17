import { useState, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, FileText, List, Menu as MenuIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Store } from '@/store/useAppStore';
import { todayStr } from '@/utils/format';

type Props = {
  page: string; onPage: (p: string) => void; store: Store;
  searchQuery: string; onSearch: (q: string) => void; onClearSearch: () => void;
  searchInputRef?: RefObject<HTMLInputElement>;
};

const MAX_LISTS_VISIBLE = 4;
const MAX_TAGS_VISIBLE = 6;

export function Sidebar({ page, onPage, store, searchQuery, onSearch, onClearSearch, searchInputRef }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data } = store;

  const todayCount = data.tasks.filter((t) => t.dueDate === todayStr() && !t.completed).length;
  const upcomingCount = data.tasks.filter((t) => t.dueDate && !t.completed).length;

  const nav = (target: string) => { onPage(target); setMobileOpen(false); };

  const visibleLists = data.lists.slice(0, MAX_LISTS_VISIBLE);
  const visibleTags = data.tags.slice(0, MAX_TAGS_VISIBLE);

  return (
    <>
      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-head"><h2>Menu</h2><button className="sidebar-close-mobile" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="search-box"><Search size={16} /><input ref={searchInputRef} placeholder="Search" value={searchQuery} onChange={(e) => onSearch(e.target.value)} aria-label="Search tasks" />{searchQuery && <button className="search-clear" onClick={onClearSearch} aria-label="Clear search"><X size={14} /></button>}</div>

        <p className="side-label">TASKS</p>
        <nav className="side-nav">
          <button className={page === 'Upcoming' ? 'active' : ''} onClick={() => nav('Upcoming')}><ArrowRight size={16} /><span>Upcoming</span>{upcomingCount > 0 && <small>{upcomingCount}</small>}</button>
          <button className={page === 'Today' ? 'active' : ''} onClick={() => nav('Today')}><List size={16} /><span>Today</span>{todayCount > 0 && <small>{todayCount}</small>}</button>
          <button className={page === 'Calendar' ? 'active' : ''} onClick={() => nav('Calendar')}><CalendarDays size={16} /><span>Calendar</span></button>
          <button className={page === 'Sticky Wall' ? 'active' : ''} onClick={() => nav('Sticky Wall')}><FileText size={16} /><span>Sticky Wall</span></button>
        </nav>

        <div className="side-section">
          <p className="side-label">LISTS</p>
          {visibleLists.map((list) => {
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
            {data.lists.length > MAX_LISTS_VISIBLE && <button className="sidebar-more-btn" onClick={() => nav('Lists Management')}>Show more</button>}
          </div>
        </div>

        <div className="side-section tags">
          <p className="side-label">TAGS</p>
          <div className="tag-list-wrap">
            {visibleTags.map((tag) => {
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
          <button className="sidebar-more-btn sidebar-show-tags" onClick={() => nav('Tags Management')}>Show tags</button>
          {data.tags.length > MAX_TAGS_VISIBLE && <button className="sidebar-more-btn" onClick={() => nav('Tags Management')}>Show more</button>}
        </div>

        <div className="sidebar-bottom">
          <button className={`side-link ${page === 'Settings' ? 'active' : ''}`} onClick={() => nav('Settings')}><SlidersHorizontal size={16} />Settings</button>
          <button className="side-link" onClick={store.signOut}><ArrowLeft size={16} />Sign out</button>
        </div>
      </aside>
      <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><MenuIcon size={20} /></button>
    </>
  );
}
export default Sidebar;
