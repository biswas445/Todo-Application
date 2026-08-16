import { useState, useEffect } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Store, EntityId } from '@/store/useAppStore';
import type { Note, NoteColor } from '@/types';
import { LIMITS } from '@/types';
import { localISO, formatDate } from '@/utils/format';

const noteColors: { value: NoteColor; label: string }[] = [
  { value: 'note-yellow', label: 'Yellow' }, { value: 'note-cyan', label: 'Cyan' }, { value: 'note-coral', label: 'Coral' },
  { value: 'note-green', label: 'Green' }, { value: 'note-blue', label: 'Blue' }, { value: 'note-pink', label: 'Pink' },
];

export function StickyWallView({ store }: { store: Store }) {
  const { data } = store;
  const [selectedNoteId, setSelectedNoteId] = useState<EntityId | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editColor, setEditColor] = useState<NoteColor>('note-yellow');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectedNote: Note | null = selectedNoteId ? data.notes.find((n) => n.id === selectedNoteId) ?? null : null;
  const dateFormat = store.data.settings.dateFormat;

  useEffect(() => {
    if (!selectedNote) return;
    setEditTitle(selectedNote.title);
    setEditBody(selectedNote.body);
    setEditColor(selectedNote.color);
    setConfirmDelete(false);
    setIsEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedNoteId(null); };
    if (selectedNoteId) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNoteId]);

  const addNote = () => { const note = store.addNote(); setSelectedNoteId(note.id); setIsEditing(true); };

  const saveNote = () => {
    if (selectedNote) {
      store.updateNote(selectedNote.id, {
        title: editTitle.trim().slice(0, LIMITS.NOTE_TITLE) || 'Untitled',
        body: editBody.slice(0, LIMITS.NOTE_BODY),
        color: editColor,
      });
      setIsEditing(false);
    }
  };
  const deleteNote = () => { if (selectedNote) { store.deleteNote(selectedNote.id); setSelectedNoteId(null); } };

  return (
    <div className="view-content sticky-view">
      <div className="view-heading">
        <div><h1>Sticky Wall</h1><span className="count-badge">{data.notes.length}</span></div>
        <button className="outline-button" onClick={addNote}><Plus size={16} />Add Note</button>
      </div>
      {data.notes.length === 0 ? (
        <div className="empty-state"><p>No notes yet. Click "Add Note" to create one.</p></div>
      ) : (
        <div className="notes-grid">
          {data.notes.map((note) => (
            <button className={`note-card ${note.color}`} key={note.id} onClick={() => setSelectedNoteId(note.id)} aria-label={`Open note ${note.title}`}>
              <h2 className="note-card-title">{note.title}</h2>
              <p className="note-card-body">{note.body}</p>
              <span className="note-date">{note.updatedAt.startsWith(localISO(new Date())) ? 'Today' : formatDate(note.updatedAt.split('T')[0], dateFormat)}</span>
            </button>
          ))}
        </div>
      )}
      {selectedNote && (
        <div className="modal-backdrop" onClick={() => setSelectedNoteId(null)}>
          <div className="note-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelectedNoteId(null)} aria-label="Close note"><X size={18} /></button>
            {!isEditing ? (
              <>
                <div className="note-swatch note-swatch-detail">{noteColors.find((c) => c.value === selectedNote.color)?.label}</div>
                <h2 className="note-detail-title">{selectedNote.title}</h2>
                <p className="note-detail-body">{selectedNote.body || 'No content.'}</p>
                <span className="note-date note-detail-date">Updated {formatDate(selectedNote.updatedAt.split('T')[0], dateFormat)}</span>
                {confirmDelete ? (
                  <div className="confirm-row"><span>Delete this note?</span><button className="danger-btn" onClick={deleteNote}>Delete</button><button className="outline-button small-btn" onClick={() => setConfirmDelete(false)}>Cancel</button></div>
                ) : (
                  <div className="note-modal-actions">
                    <button className="danger-btn-text" onClick={() => setConfirmDelete(true)} aria-label="Delete note"><Trash2 size={15} />Delete</button>
                    <div className="modal-actions-right">
                      <button className="outline-button small-btn" onClick={() => setSelectedNoteId(null)}>Close</button>
                      <button className="primary-button small-btn edit-btn" onClick={() => setIsEditing(true)}><Pencil size={14} />Edit</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="note-color-row">
                  {noteColors.map((c) => <button key={c.value} className={`note-swatch-option ${c.value} ${editColor === c.value ? 'selected' : ''}`} onClick={() => setEditColor(c.value)} aria-label={`${c.label} color`} />)}
                </div>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value.slice(0, LIMITS.NOTE_TITLE))} placeholder="Title" maxLength={LIMITS.NOTE_TITLE} aria-label="Note title" />
                <textarea value={editBody} onChange={(e) => setEditBody(e.target.value.slice(0, LIMITS.NOTE_BODY))} placeholder="Write something..." maxLength={LIMITS.NOTE_BODY} aria-label="Note content" />
                {confirmDelete ? (
                  <div className="confirm-row"><span>Delete this note?</span><button className="danger-btn" onClick={deleteNote}>Delete</button><button className="outline-button small-btn" onClick={() => setConfirmDelete(false)}>Cancel</button></div>
                ) : (
                  <div className="note-modal-actions">
                    <button className="danger-btn-text" onClick={() => setConfirmDelete(true)} aria-label="Delete note"><Trash2 size={15} />Delete</button>
                    <div className="modal-actions-right">
                      <button className="outline-button small-btn" onClick={() => setIsEditing(false)}>Cancel</button>
                      <button className="primary-button small-btn edit-btn" onClick={saveNote}>Save</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default StickyWallView;
