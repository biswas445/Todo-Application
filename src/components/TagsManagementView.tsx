import { useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2, CheckSquare, Check } from 'lucide-react';
import type { Store, EntityId } from '@/store/useAppStore';
import type { TaskColor } from '@/types';
import { LIMITS } from '@/types';

const colorOptions: TaskColor[] = ['coral', 'cyan', 'yellow', 'green', 'blue'];
const tagClassMap: Record<string, string> = { cyan: 'cyan-tag', coral: 'coral-tag', yellow: 'yellow-tag', green: 'green-tag', blue: 'blue-tag' };

export function TagsManagementView({ store, onPage }: { store: Store; onPage: (p: string) => void }) {
  const { data } = store;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<TaskColor>('cyan');
  const [editingId, setEditingId] = useState<EntityId | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<TaskColor>('cyan');
  const [confirmDelete, setConfirmDelete] = useState<EntityId | null>(null);
  
  // Bulk selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<EntityId>>(new Set());
  
  const toggleSelection = (tagId: EntityId) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };
  
  const deleteSelected = () => {
    selectedTagIds.forEach(id => store.deleteTag(id));
    setSelectedTagIds(new Set());
    setIsSelectionMode(false);
  };

  const startEdit = (id: EntityId) => {
    const tag = data.tags.find((t) => t.id === id);
    if (!tag) return;
    setEditingId(id);
    setEditName(tag.label);
    setEditColor(tag.color);
    setConfirmDelete(null);
  };

  const saveEdit = () => {
    const trimmed = editName.trim().slice(0, LIMITS.TAG_NAME);
    if (editingId && trimmed) {
      store.updateTag(editingId, { label: trimmed, color: editColor });
      setEditingId(null);
      setEditName('');
      setEditColor('cyan');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('cyan');
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim().slice(0, LIMITS.TAG_NAME);
    if (trimmed) {
      store.addTag(trimmed, newColor);
      setNewName('');
      setAdding(false);
    }
  };

  return (
    <div className="view-content management-view">
      <div className="view-heading">
        <div><h1>Tags</h1><span className="count-badge">{data.tags.length}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSelectionMode ? (
            <>
              <button className="outline-button small-btn" onClick={() => { setIsSelectionMode(false); setSelectedTagIds(new Set()); }}>Cancel</button>
              {selectedTagIds.size > 0 && (
                <button className="danger-btn small-btn" onClick={deleteSelected}>Delete ({selectedTagIds.size})</button>
              )}
            </>
          ) : (
            <>
              <button className="outline-button" onClick={() => setAdding(true)}><Plus size={16} />Add Tag</button>
              {data.tags.length > 0 && (
                <button className="more-button" aria-label="Select tags" onClick={() => setIsSelectionMode(true)}>
                  <CheckSquare size={20} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {adding && (
        <form className="mgmt-add-form" onSubmit={handleAdd}>
          <input className="mgmt-input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value.slice(0, LIMITS.TAG_NAME))} placeholder="Tag name" maxLength={LIMITS.TAG_NAME} />
          <div className="edit-color-row">{colorOptions.map((c) => <button type="button" key={c} className={`color-square ${c} ${newColor === c ? 'color-selected' : ''}`} onClick={() => setNewColor(c)} aria-label={`${c} color`} />)}</div>
          <div className="mgmt-form-actions">
            <button type="submit" className="primary-button small-btn">Add</button>
            <button type="button" className="outline-button small-btn" onClick={() => { setAdding(false); setNewName(''); }}>Cancel</button>
          </div>
        </form>
      )}

      {data.tags.length === 0 && !adding ? (
        <div className="empty-state"><p>No tags yet. Create one to label your tasks.</p></div>
      ) : (
        <div className="mgmt-grid mgmt-grid-tags">
          {data.tags.map((tag) => {
            const count = data.tasks.filter((t) => t.tagIds.includes(tag.id)).length;
            const incomplete = data.tasks.filter((t) => t.tagIds.includes(tag.id) && !t.completed).length;
            if (editingId === tag.id) {
              return (
                <div key={tag.id} className="mgmt-card mgmt-card-editing">
                  <input className="mgmt-input" autoFocus value={editName} onChange={(e) => setEditName(e.target.value.slice(0, LIMITS.TAG_NAME))} placeholder="Tag name" maxLength={LIMITS.TAG_NAME} />
                  <div className="edit-color-row">{colorOptions.map((c) => <button key={c} className={`color-square ${c} ${editColor === c ? 'color-selected' : ''}`} onClick={() => setEditColor(c)} aria-label={`${c} color`} />)}</div>
                  <div className="mgmt-form-actions">
                    <button className="primary-button small-btn" onClick={saveEdit}>Save</button>
                    <button className="outline-button small-btn" onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              );
            }
            const isSelected = selectedTagIds.has(tag.id);
            if (isSelectionMode) {
              return (
                <div
                  key={tag.id}
                  className={`mgmt-card mgmt-card-tag mgmt-card-selectable ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelection(tag.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelection(tag.id); } }}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Deselect' : 'Select'} tag ${tag.label}`}
                >
                  <div className="mgmt-card-head">
                    <span className={`checkbox select-check ${isSelected ? 'checked' : ''}`} aria-hidden="true">{isSelected && <Check size={12} />}</span>
                    <span className={`tag ${tagClassMap[tag.color]}`}>{tag.label}</span>
                    <span className="mgmt-card-title mgmt-card-title-tag"><ChevronRight size={16} /></span>
                  </div>
                  <div className="mgmt-card-meta">
                    <span>{incomplete} active</span>
                    <span>{count} total</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={tag.id} className="mgmt-card mgmt-card-tag">
                <div className="mgmt-card-head">
                  <span className={`tag ${tagClassMap[tag.color]}`}>{tag.label}</span>
                  <button className="mgmt-card-title mgmt-card-title-tag" onClick={() => onPage(`tag-${tag.id}`)} title={tag.label} aria-label={`Open tag ${tag.label}`}><ChevronRight size={16} /></button>
                </div>
                <div className="mgmt-card-meta">
                  <span>{incomplete} active</span>
                  <span>{count} total</span>
                </div>
                <div className="mgmt-card-actions">
                  <button className="side-action-btn" onClick={() => startEdit(tag.id)} aria-label={`Edit ${tag.label}`}><Pencil size={14} />Edit</button>
                  {confirmDelete === tag.id ? (
                    <span className="mgmt-confirm-inline">
                      <span>Delete?</span>
                      <button className="danger-btn small-btn" onClick={() => { store.deleteTag(tag.id); setConfirmDelete(null); }}>Yes</button>
                      <button className="outline-button small-btn" onClick={() => setConfirmDelete(null)}>No</button>
                    </span>
                  ) : (
                    <button className="side-action-btn danger" onClick={() => setConfirmDelete(tag.id)} aria-label={`Delete ${tag.label}`}><Trash2 size={14} />Delete</button>
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

export default TagsManagementView;
