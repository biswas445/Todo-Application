import type { AppData, ListItem, TagItem, Note, Task, CalendarEvent, Settings, User, TaskColor, EntityId } from '@/types';

const uid = (): EntityId => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

const nowISO = () => new Date().toISOString();
const dateOffset = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const L1 = uid(), L2 = uid(), L3 = uid();
const T1 = uid(), T2 = uid();

export function defaultLists(): ListItem[] { return [
  { id: L1, label: 'Personal', color: 'coral', createdAt: nowISO(), updatedAt: nowISO() },
  { id: L2, label: 'Work', color: 'cyan', createdAt: nowISO(), updatedAt: nowISO() },
  { id: L3, label: 'List 1', color: 'yellow', createdAt: nowISO(), updatedAt: nowISO() },
]; }

export function defaultTags(): TagItem[] { return [
  { id: T1, label: 'Tag 1', color: 'cyan', createdAt: nowISO(), updatedAt: nowISO() },
  { id: T2, label: 'Tag 2', color: 'coral', createdAt: nowISO(), updatedAt: nowISO() },
]; }

export function defaultTasks(): Task[] { return [
  { id: uid(), title: 'Research content ideas', description: 'Gather trending topics for next month\'s editorial calendar.', completed: false, priority: 'Normal', dueDate: dateOffset(0), listId: L2, tagIds: [T1], subtasks: [{ id: uid(), title: 'Check competitor blogs', completed: true, createdAt: nowISO() }, { id: uid(), title: 'Review analytics', completed: false, createdAt: nowISO() }], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Create a database of guest authors', description: 'Reach out to 5 potential contributors this week.', completed: false, priority: 'Low', dueDate: dateOffset(2), listId: L2, tagIds: [T1, T2], subtasks: [], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Renew driver\u2019s license', description: 'Book an appointment at the DMV before it expires.', completed: false, priority: 'High', dueDate: dateOffset(0), listId: L1, tagIds: [T2], subtasks: [{ id: uid(), title: 'Gather documents', completed: false, createdAt: nowISO() }], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Consult accountant', description: 'Discuss quarterly tax filings and deductions.', completed: false, priority: 'Normal', dueDate: dateOffset(3), listId: L3, tagIds: [], subtasks: [{ id: uid(), title: 'Prepare documents', completed: false, createdAt: nowISO() }, { id: uid(), title: 'Confirm appointment', completed: false, createdAt: nowISO() }, { id: uid(), title: 'Send prior year returns', completed: false, createdAt: nowISO() }], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Print business card', description: 'Finalize the design with the printer.', completed: false, priority: 'Low', dueDate: dateOffset(1), listId: L1, tagIds: [T2], subtasks: [], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Prepare Q1 marketing report', description: 'Compile metrics from all channels for the leadership review.', completed: false, priority: 'High', dueDate: dateOffset(1), listId: L2, tagIds: [T1], subtasks: [{ id: uid(), title: 'Pull analytics data', completed: false, createdAt: nowISO() }, { id: uid(), title: 'Write executive summary', completed: false, createdAt: nowISO() }], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Schedule team retrospective', description: 'Find a time slot that works for the whole team.', completed: false, priority: 'Normal', dueDate: dateOffset(4), listId: L2, tagIds: [], subtasks: [], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Review design proposals', description: 'Evaluate the three agency proposals and pick a finalist.', completed: false, priority: 'Normal', dueDate: dateOffset(5), listId: L2, tagIds: [T1, T2], subtasks: [{ id: uid(), title: 'Score each proposal', completed: false, createdAt: nowISO() }, { id: uid(), title: 'Schedule finalist interview', completed: false, createdAt: nowISO() }, { id: uid(), title: 'Check references', completed: false, createdAt: nowISO() }, { id: uid(), title: 'Negotiate scope', completed: false, createdAt: nowISO() }], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Update portfolio website', description: 'Add the last three projects to the portfolio.', completed: false, priority: 'Low', dueDate: dateOffset(6), listId: L1, tagIds: [], subtasks: [], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Book dentist appointment', description: 'Six-month checkup is overdue.', completed: false, priority: 'Normal', dueDate: dateOffset(2), listId: L1, tagIds: [T2], subtasks: [], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Plan birthday dinner', description: 'Pick a restaurant and send invites.', completed: false, priority: 'Normal', dueDate: dateOffset(3), listId: L3, tagIds: [], subtasks: [{ id: uid(), title: 'Choose restaurant', completed: false, createdAt: nowISO() }, { id: uid(), title: 'Send invites', completed: false, createdAt: nowISO() }], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Organize home office', description: 'Declutter desk and set up new shelving.', completed: false, priority: 'Low', dueDate: dateOffset(7), listId: L3, tagIds: [], subtasks: [], createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Submit expense report', description: 'Q1 expenses for reimbursement.', completed: true, priority: 'Normal', dueDate: dateOffset(-1), listId: L2, tagIds: [T1], subtasks: [], createdAt: nowISO(), updatedAt: nowISO() },
]; }

export function defaultNotes(): Note[] { return [
  { id: uid(), title: 'Product ideas', body: 'Try a calmer start page with one clear next action.', color: 'note-yellow', createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Meeting notes', body: 'Bring the updated timeline and the new research summary.', color: 'note-cyan', createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Shopping list', body: 'Oat milk\nFresh flowers\nNotebook', color: 'note-coral', createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Books to read', body: 'Atomic Habits\nThe Creative Act', color: 'note-green', createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Weekend plans', body: 'Long walk\nVisit the market\nCall Mum', color: 'note-blue', createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Ideas for later', body: 'A small place to collect the thoughts that arrive between tasks.', color: 'note-pink', createdAt: nowISO(), updatedAt: nowISO() },
]; }

export function defaultEvents(): CalendarEvent[] { return [
  { id: uid(), title: 'Marketing Sprint', description: '', date: dateOffset(0), startTime: '09:00', endTime: '10:00', color: 'cyan', createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Sales Catchup', description: '', date: dateOffset(0), startTime: '10:00', endTime: '10:30', color: 'cyan', createdAt: nowISO(), updatedAt: nowISO() },
  { id: uid(), title: 'Renew driver\u2019s license', description: '', date: dateOffset(0), startTime: '11:00', endTime: '12:00', color: 'coral', createdAt: nowISO(), updatedAt: nowISO() },
]; }

export const defaultSettings: Settings = {
  displayName: 'Alex Morgan', email: 'email.email@mail.com', timezone: 'UTC', bio: 'Product designer & calm productivity enthusiast',
  language: 'English (US)', dateFormat: 'DD-MM-YY', startOfWeek: 'Monday', timeFormat: '12-hour',
  pushNotifications: true, taskReminders: false,
};

export function defaultUser(): User { return { id: uid(), name: 'Alex Morgan', email: 'email.email@mail.com', password: 'mindfulpassword', bio: 'Product designer & calm productivity enthusiast', timezone: 'UTC' }; }

export function defaultData(): AppData { return { tasks: defaultTasks(), lists: defaultLists(), tags: defaultTags(), notes: defaultNotes(), events: defaultEvents(), user: defaultUser(), settings: { ...defaultSettings }, session: false }; }

export const listColors: TaskColor[] = ['coral', 'cyan', 'yellow', 'green', 'blue'];
export const tagColors: TaskColor[] = ['cyan', 'coral', 'yellow', 'green', 'blue'];
export { uid };
