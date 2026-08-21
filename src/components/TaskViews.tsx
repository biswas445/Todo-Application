import { useState, useEffect, useRef } from 'react';
import { CalendarDays, Check, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Task, ListItem, TagItem, Store, EntityId } from '@/store/useAppStore';
import type { Priority, Subtask } from '@/types';
import { LIMITS } from '@/types';
import { formatDate } from '@/utils/format';

function CharCounter({ current, max }: { current: number; max: number }) {
  const near = current > max * 0.85;
  return <span className={`char-counter ${near ? 'char-counter-near' : ''}`}>{current} / {max}</span>;
}

export function TaskRow({ task, lists, store, onOpen, hideCheckbox }: { task: Task; lists: ListItem[]; store: Store; onOpen: (id: EntityId) => void; hideCheckbox?: boolean }) {
  const list = lists.find((l) => l.id === task.listId);
  const dateFormat = store.data.settings.dateFormat;
  const done = task.subtasks.filter((s: Subtask) => s.completed).length;
  return (
    <div className={`task-row ${task.completed ? 'completed' : ''}`} style={{ display: 'flex', width: '100%' }}>
      {!hideCheckbox && (
        <button className="checkbox" onClick={() => store.toggleTask(task.id)} aria-label={`Mark ${task.title} as ${task.completed ? 'incomplete' : 'complete'}`}>{task.completed && <Check size={12} />}</button>
      )}
      <button className="task-title" onClick={() => onOpen(task.id)} title={task.title} style={{ flex: 1 }}>{task.title}</button>
      <button className="task-arrow" onClick={() => onOpen(task.id)} aria-label="Open task details"><ChevronRight size={18} /></button>
      {(task.dueDate || list || task.subtasks.length > 0) && (
        <div className="task-meta">
          {task.dueDate && <span><CalendarDays size={13} />{formatDate(task.dueDate, dateFormat)}</span>}
          {task.subtasks.length > 0 && <><span className="subtask-count">{done}/{task.subtasks.length}</span><span>Subtasks</span></>}
          {list && <span><i className={`color-square ${list.color}`} /><span className="task-meta-label">{list.label}</span></span>}
          {task.priority === 'High' && <span className="priority-high"><strong>High</strong></span>}
        </div>
      )}
    </div>
  );
}

export function AddTask({ store, defaultListId, defaultDueDate }: { store: Store; defaultListId?: EntityId | null; defaultDueDate?: string }) {
  const [value, setValue] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim().slice(0, LIMITS.TASK_TITLE);
    if (!trimmed) return;
    store.addTask({ title: trimmed, description: '', completed: false, priority: 'Normal', dueDate: defaultDueDate ?? null, listId: defaultListId ?? null, tagIds: [], subtasks: [] });
    setValue('');
  };
  return <form className="add-task" onSubmit={submit}><Plus size={18} /><input value={value} onChange={(e) => setValue(e.target.value.slice(0, LIMITS.TASK_TITLE))} placeholder="Add New Task" maxLength={LIMITS.TASK_TITLE} /></form>;
}

function SubtaskRow({ sub, taskId, store }: { sub: Subtask; taskId: EntityId; store: Store }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(sub.title);
  const saveEdit = () => { const trimmed = editValue.trim().slice(0, LIMITS.SUBTASK_TITLE); if (trimmed) { store.editSubtask(taskId, sub.id, trimmed); setEditing(false); } };
  if (editing) {
    return (
      <div className="subtask-item">
        <input className="subtask-edit-input" autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value.slice(0, LIMITS.SUBTASK_TITLE))} onBlur={saveEdit} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }} maxLength={LIMITS.SUBTASK_TITLE} />
        <button className="subtask-delete" onClick={() => setEditing(false)} aria-label="Cancel edit"><X size={13} /></button>
      </div>
    );
  }
  return (
    <div className="subtask-item">
      <button className={`checkbox subtask-check ${sub.completed ? 'checked' : ''}`} onClick={() => store.toggleSubtask(taskId, sub.id)} aria-label={`Toggle subtask ${sub.title}`}>{sub.completed && <Check size={10} />}</button>
      <span className={sub.completed ? 'completed' : ''}>{sub.title}</span>
      <button className="subtask-action" onClick={() => { setEditValue(sub.title); setEditing(true); }} aria-label="Edit subtask"><Pencil size={11} /></button>
      <button className="subtask-delete" onClick={() => store.deleteSubtask(taskId, sub.id)} aria-label="Delete subtask"><Trash2 size={13} /></button>
    </div>
  );
}

export function TaskModal({ selectedTaskId, lists, tags, store, onClose }: { selectedTaskId: EntityId | null; lists: ListItem[]; tags: TagItem[]; store: Store; onClose: () => void }) {
  const task = selectedTaskId ? store.data.tasks.find((t) => t.id === selectedTaskId) ?? null : null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [listId, setListId] = useState<EntityId | null>(null);
  const [selectedTags, setSelectedTags] = useState<EntityId[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const formKey = useRef<string>('');

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description);
    setDueDate(task.dueDate ?? '');
    setPriority(task.priority);
    setListId(task.listId);
    setSelectedTags(task.tagIds);
    setConfirmDelete(false);
    setIsEditing(false);
    setShowDiscard(false);
    setNewSubtask('');
    formKey.current = task.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (showDiscard) setShowDiscard(false); else onClose(); } };
    if (selectedTaskId) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedTaskId, showDiscard, onClose]);

  if (!selectedTaskId || !task) return null;

  const dateFormat = store.data.settings.dateFormat;
  const done = task.subtasks.filter((s) => s.completed).length;
  const hasUnsavedChanges = isEditing && (
    title !== task.title ||
    description !== task.description ||
    dueDate !== (task.dueDate ?? '') ||
    priority !== task.priority ||
    listId !== task.listId ||
    JSON.stringify(selectedTags) !== JSON.stringify(task.tagIds)
  );

  const save = () => {
    const trimmed = title.trim().slice(0, LIMITS.TASK_TITLE);
    if (!trimmed) return;
    store.updateTask(task.id, { title: trimmed, description: description.slice(0, LIMITS.TASK_DESCRIPTION), dueDate: dueDate || null, priority, listId, tagIds: selectedTags });
    onClose();
  };

  const toggleTag = (tagId: EntityId) => setSelectedTags((prev) => prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]);
  const addSub = (e: React.FormEvent) => { e.preventDefault(); const trimmed = newSubtask.trim().slice(0, LIMITS.SUBTASK_TITLE); if (trimmed) { store.addSubtask(task.id, trimmed); setNewSubtask(''); } };

  const handleClose = () => { if (hasUnsavedChanges) setShowDiscard(true); else onClose(); };

  const renderActions = (onCancel: () => void, onSave: () => void, saveLabel: string) => (
    <div className="modal-actions">
      <button className="danger-btn-text" onClick={() => setConfirmDelete(true)} aria-label="Delete task"><Trash2 size={15} />Delete</button>
      <div className="modal-actions-right">
        <button className="outline-button small-btn" onClick={onCancel}>Cancel</button>
        <button className="primary-button small-btn edit-btn" onClick={onSave} disabled={!title.trim()}>{saveLabel}</button>
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className={`task-modal ${isEditing ? 'task-modal-editing' : 'task-modal-detail'}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-top"><span>{isEditing ? 'Edit task' : 'Task details'}</span><button onClick={handleClose} aria-label="Close task details"><X size={18} /></button></div>
        {!isEditing ? (
          <>
            <h2 className="detail-title">{task.title}</h2>
            <div className="detail-description">
              <span className="detail-section-label">Description</span>
              <p>{task.description || 'No description added.'}</p>
            </div>
            <div className="detail-info-grid">
              <div className="detail-info-item"><span>Due date</span><strong>{task.dueDate ? formatDate(task.dueDate, dateFormat) : 'No due date'}</strong></div>
              <div className="detail-info-item"><span>Priority</span><strong className={task.priority === 'High' ? 'priority-high' : ''}>{task.priority}</strong></div>
              <div className="detail-info-item"><span>Status</span><strong>{task.completed ? 'Completed' : 'Open'}</strong></div>
              <div className="detail-info-item"><span>List</span><strong>{lists.find((list) => list.id === task.listId)?.label || 'No list'}</strong></div>
            </div>
            <div className="detail-section">
              <span className="detail-section-label">Tags</span>
              <div className="modal-tags">
                {task.tagIds.length > 0 ? task.tagIds.map((tagId) => {
                  const tag = tags.find((item) => item.id === tagId);
                  return tag ? <span key={tag.id} className={`tag ${tag.color}-tag`}>{tag.label}</span> : null;
                }) : <span className="detail-muted">No tags</span>}
              </div>
            </div>
            <div className="detail-section">
              <span className="detail-section-label">Subtasks {task.subtasks.length > 0 && <span className="subtask-progress">{done} / {task.subtasks.length} completed</span>}</span>
              {task.subtasks.length > 0 ? (
                <div className="detail-subtask-list">
                  {task.subtasks.map((sub) => (
                    <div className="detail-subtask" key={sub.id}>
                      <span className={`detail-subtask-check ${sub.completed ? 'done' : ''}`}>{sub.completed ? <Check size={10} /> : ''}</span>
                      <span className={sub.completed ? 'completed' : ''}>{sub.title}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="detail-muted">No subtasks</span>}
            </div>
            <div className="detail-meta-row">
              <span>Created {formatDate(task.createdAt.split('T')[0], dateFormat)}</span>
              <span>Updated {formatDate(task.updatedAt.split('T')[0], dateFormat)}</span>
            </div>
            <div className="modal-actions detail-actions">
              <button className="danger-btn-text" onClick={() => setConfirmDelete(true)} aria-label="Delete task"><Trash2 size={15} />Delete</button>
              <div className="modal-actions-right">
                <button className="outline-button small-btn" onClick={handleClose}>Close</button>
                <button className="primary-button small-btn edit-btn" onClick={() => setIsEditing(true)}><Pencil size={14} />Edit</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <input key={`title-${formKey.current}`} className="modal-title-input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, LIMITS.TASK_TITLE))} placeholder="Task title" maxLength={LIMITS.TASK_TITLE} />
            <div className="char-counter-row"><CharCounter current={title.length} max={LIMITS.TASK_TITLE} /></div>
            <label className="modal-label">Description
              <textarea className="modal-textarea" value={description} onChange={(e) => setDescription(e.target.value.slice(0, LIMITS.TASK_DESCRIPTION))} placeholder="Add a description..." maxLength={LIMITS.TASK_DESCRIPTION} />
              <div className="char-counter-row"><CharCounter current={description.length} max={LIMITS.TASK_DESCRIPTION} /></div>
            </label>
            <div className="modal-row">
              <label className="modal-field"><span>Due date</span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
              <label className="modal-field"><span>Priority</span><select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option value="Low">Low</option><option value="Normal">Normal</option><option value="High">High</option></select></label>
            </div>
            <label className="modal-field modal-field-full"><span>List</span><select value={listId ?? ''} onChange={(e) => setListId(e.target.value || null)}><option value="">No list</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
            <div className="modal-field-full"><span className="modal-field-label">Tags</span><div className="modal-tags">{tags.map((tag) => <button type="button" key={tag.id} className={`tag tag-selectable ${selectedTags.includes(tag.id) ? 'tag-selected' : ''}`} onClick={() => toggleTag(tag.id)}>{tag.label}</button>)}</div></div>
            <div className="modal-field-full">
              <span className="modal-field-label">Subtasks</span>
              <form className="add-subtask" onSubmit={addSub}><input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value.slice(0, LIMITS.SUBTASK_TITLE))} placeholder="Add subtask" maxLength={LIMITS.SUBTASK_TITLE} /><button type="submit" aria-label="Add subtask"><Plus size={14} /></button></form>
              <div className="subtask-list">{task.subtasks.map((sub) => <SubtaskRow key={sub.id} sub={sub} taskId={task.id} store={store} />)}</div>
            </div>
            {confirmDelete ? (
              <div className="confirm-row"><span>Delete this task?</span><button className="danger-btn" onClick={() => { store.deleteTask(task.id); onClose(); }}>Delete</button><button className="outline-button small-btn" onClick={() => setConfirmDelete(false)}>Cancel</button></div>
            ) : renderActions(() => { if (hasUnsavedChanges) setShowDiscard(true); else setIsEditing(false); }, save, 'Save')}
          </>
        )}
        {!isEditing && confirmDelete && (
          <div className="confirm-row"><span>Delete this task?</span><button className="danger-btn" onClick={() => { store.deleteTask(task.id); onClose(); }}>Delete</button><button className="outline-button small-btn" onClick={() => setConfirmDelete(false)}>Cancel</button></div>
        )}
        {showDiscard && (
          <div className="modal-backdrop-inner" onClick={(e) => e.stopPropagation()}>
            <div className="discard-dialog">
              <p>Discard unsaved changes?</p>
              <div className="discard-actions">
                <button className="outline-button small-btn" onClick={() => setShowDiscard(false)}>Keep editing</button>
                <button className="danger-btn small-btn" onClick={() => { setShowDiscard(false); if (isEditing) setIsEditing(false); else onClose(); }}>Discard</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="empty-state"><p>{message}</p></div>;
}
