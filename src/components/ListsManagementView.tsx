import { useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2, CheckSquare } from 'lucide-react';
import type { Store, EntityId } from '@/store/useAppStore';
import type { TaskColor } from '@/types';
import { LIMITS } from '@/types';

const colorOptions: TaskColor[] = ['coral', 'cyan', 'yellow', 'green', 'blue'];

export function ListsManagementView({ store, onPage }: { store: Store; onPage: (p: string) => void }) {
  const { data } = store;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<TaskColor>('coral');
  const [editingId, setEditingId] = useState<EntityId | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<TaskColor>('coral');
  const [confirmDelete, setConfirmDelete] = useState<EntityId | null>(null);
  
  // Bulk selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState<Set<EntityId>>(new Set());
  
  const toggleSelection = (listId: EntityId) => {
    setSelectedListIds(prev => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  };
  
  const deleteSelected = () => {
    selectedListIds.forEach(id => store.deleteList(id));
    setSelectedListIds(new Set());
    setIsSelectionMode(false);
  };

  const startEdit = (id: EntityId) => {
    const list = data.lists.find((l) => l.id === id);
    if (!list) return;
    setEditingId(id);
    setEditName(list.label);
    setEditColor(list.color);
    setConfirmDelete(null);
  };

  const saveEdit = () => {
    const trimmed = editName.trim().slice(0, LIMITS.LIST_NAME);
    if (editingId && trimmed) {
      store.updateList(editingId, { label: trimmed, color: editColor });
      setEditingId(null);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim().slice(0, LIMITS.LIST_NAME);
    if (trimmed) {
      store.addList(trimmed, newColor);
      setNewName('');
      setAdding(false);
    }
  };

  return (
    <div className="view-content management-view">
      <div className="view-heading">
        <div><h1>Lists</h1><span className="count-badge">{data.lists.length}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSelectionMode ? (
            <>
              <button className="outline-button small-btn" onClick={() => { setIsSelectionMode(false); setSelectedListIds(new Set()); }}>Cancel</button>
              {selectedListIds.size > 0 && (
                <button className="danger-btn small-btn" onClick={deleteSelected}>Delete ({selectedListIds.size})</button>
              )}
            </>
          ) : (
            <>
              <button className="outline-button" onClick={() => setAdding(true)}><Plus size={16} />Add New List</button>
              {data.lists.length > 0 && (
                <button className="more-button" aria-label="Select lists" onClick={() => setIsSelectionMode(true)}>
                  <CheckSquare size={20} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {adding && (
        <form className="mgmt-add-form" onSubmit={handleAdd}>
          <input className="mgmt-input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value.slice(0, LIMITS.LIST_NAME))} placeholder="List name" maxLength={LIMITS.LIST_NAME} />
          <div className="edit-color-row">{colorOptions.map((c) => <button type="button" key={c} className={`color-square ${c} ${newColor === c ? 'color-selected' : ''}`} onClick={() => setNewColor(c)} aria-label={`${c} color`} />)}</div>
          <div className="mgmt-form-actions">
            <button type="submit" className="primary-button small-btn">Add</button>
            <button type="button" className="outline-button small-btn" onClick={() => { setAdding(false); setNewName(''); }}>Cancel</button>
          </div>
        </form>
      )}

      {data.lists.length === 0 && !adding ? (
        <div className="empty-state"><p>No lists yet. Create one to organize your tasks.</p></div>
      ) : (
        <div className="mgmt-grid">
          {data.lists.map((list) => {
            const count = data.tasks.filter((t) => t.listId === list.id).length;
            const incomplete = data.tasks.filter((t) => t.listId === list.id && !t.completed).length;
            if (editingId === list.id) {
              return (
                <div key={list.id} className="mgmt-card mgmt-card-editing">
                  <input className="mgmt-input" autoFocus value={editName} onChange={(e) => setEditName(e.target.value.slice(0, LIMITS.LIST_NAME))} placeholder="List name" maxLength={LIMITS.LIST_NAME} />
                  <div className="edit-color-row">{colorOptions.map((c) => <button key={c} className={`color-square ${c} ${editColor === c ? 'color-selected' : ''}`} onClick={() => setEditColor(c)} aria-label={`${c} color`} />)}</div>
                  <div className="mgmt-form-actions">
                    <button className="primary-button small-btn" onClick={saveEdit}>Save</button>
                    <button className="outline-button small-btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={list.id} className="mgmt-card" style={{ position: 'relative' }}>
                {isSelectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedListIds.has(list.id)}
                    onChange={() => toggleSelection(list.id)}
                    style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10 }}
                  />
                )}
                <div className="mgmt-card-head" style={{ paddingLeft: isSelectionMode ? '32px' : '0' }}>
                  <i className={`color-square ${list.color}`} />
                  <button className="mgmt-card-title" onClick={() => onPage(`list-${list.id}`)} title={list.label}>{list.label}</button>
                  <ChevronRight size={16} className="mgmt-chevron" />
                </div>
                <div className="mgmt-card-meta">
                  <span>{incomplete} active</span>
                  <span>{count} total</span>
                </div>
                <div className="mgmt-card-actions">
                  {!isSelectionMode && (
                    <>
                      <button className="side-action-btn" onClick={() => startEdit(list.id)} aria-label={`Edit ${list.label}`}><Pencil size={14} />Edit</button>
                      {confirmDelete === list.id ? (
                        <span className="mgmt-confirm-inline">
                          <span>Delete?</span>
                          <button className="danger-btn small-btn" onClick={() => { store.deleteList(list.id); setConfirmDelete(null); }}>Yes</button>
                          <button className="outline-button small-btn" onClick={() => setConfirmDelete(null)}>No</button>
                        </span>
                      ) : (
                        <button className="side-action-btn danger" onClick={() => setConfirmDelete(list.id)} aria-label={`Delete ${list.label}`}><Trash2 size={14} />Delete</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ListsManagementView;
