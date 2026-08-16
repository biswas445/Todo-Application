export type EntityId = string;
export type Priority = 'Low' | 'Normal' | 'High';
export type TaskColor = 'coral' | 'cyan' | 'yellow' | 'green' | 'blue';
export type NoteColor = 'note-yellow' | 'note-cyan' | 'note-coral' | 'note-green' | 'note-blue' | 'note-pink';

export type Subtask = { id: EntityId; title: string; completed: boolean; createdAt: string };
export type Task = {
  id: EntityId; title: string; description: string; completed: boolean; priority: Priority;
  dueDate: string | null; listId: EntityId | null; tagIds: EntityId[]; subtasks: Subtask[];
  createdAt: string; updatedAt: string;
};
export type ListItem = { id: EntityId; label: string; color: TaskColor; createdAt: string; updatedAt: string };
export type TagItem = { id: EntityId; label: string; color: TaskColor; createdAt: string; updatedAt: string };
export type Note = { id: EntityId; title: string; body: string; color: NoteColor; createdAt: string; updatedAt: string };
export type CalendarEvent = { id: EntityId; title: string; description: string; date: string; startTime: string; endTime: string; color: TaskColor; createdAt: string; updatedAt: string };
export type User = { id: EntityId; name: string; email: string; password: string; bio: string; timezone: string };
export type Settings = {
  displayName: string; email: string; timezone: string; bio: string; language: string; dateFormat: string;
  startOfWeek: string; timeFormat: string;
  pushNotifications: boolean; taskReminders: boolean;
};
export type AppData = { tasks: Task[]; lists: ListItem[]; tags: TagItem[]; notes: Note[]; events: CalendarEvent[]; user: User | null; settings: Settings; session: boolean };

export const LIMITS = {
  TASK_TITLE: 120,
  TASK_DESCRIPTION: 2000,
  SUBTASK_TITLE: 200,
  LIST_NAME: 60,
  TAG_NAME: 40,
  NOTE_TITLE: 100,
  NOTE_BODY: 2000,
  EVENT_TITLE: 120,
  EVENT_DESCRIPTION: 1000,
  DISPLAY_NAME: 60,
  BIO_WORDS: 200,
};
