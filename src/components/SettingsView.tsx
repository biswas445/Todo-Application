import { useState, useMemo, useEffect } from 'react';
import { Bell, Globe, Lock, User, X, AlertTriangle } from 'lucide-react';
import type { Store } from '@/store/useAppStore';
import type { Settings as SettingsType } from '@/types';
import { LIMITS } from '@/types';

const ianaTimezones = [
  'UTC',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Mexico_City',
  'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Dubai',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
];

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div><p className="toggle-title">{label}</p><p className="toggle-desc">{desc}</p></div>
      <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value} aria-label={label}><span className="toggle-knob" /></button>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return <section className="settings-card"><div className="settings-card-head"><Icon size={18} /><h2>{title}</h2></div>{children}</section>;
}

function Field({ label, value, onChange, maxLength, readOnly, hint }: { label: string; value: string; onChange?: (v: string) => void; maxLength?: number; readOnly?: boolean; hint?: string }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input value={value} onChange={onChange ? (e) => onChange(e.target.value.slice(0, maxLength ?? undefined)) : undefined} readOnly={readOnly} maxLength={maxLength} className={readOnly ? 'settings-input-readonly' : ''} />
      {hint && <em className="settings-hint">{hint}</em>}
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return <label className="settings-field"><span>{label}</span><div className="settings-select"><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></div></label>;
}

function PasswordModal({ store, onClose }: { store: Store; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    const result = await store.changePassword(current, next);
    if (!result.ok) { setError(result.error || 'Failed to change password.'); return; }
    setSuccess(true);
    setCurrent(''); setNext(''); setConfirm('');
    setTimeout(() => { setSuccess(false); onClose(); }, 1500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="note-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button className="close-modal" type="button" onClick={onClose} aria-label="Close password dialog"><X size={18} /></button>
        <h2 className="event-modal-title">Change Password</h2>
        {success && <p className="auth-success-inline">Password changed successfully.</p>}
        <label className="settings-field"><span>Current password</span><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></label>
        <label className="settings-field"><span>New password</span><input type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" /></label>
        <label className="settings-field"><span>Confirm new password</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" /></label>
        {error && <p className="auth-error">{error}</p>}
        <div className="modal-actions">
          <div className="modal-actions-right"><button className="outline-button small-btn" type="button" onClick={onClose}>Cancel</button><button className="primary-button small-btn edit-btn" type="submit">Change Password</button></div>
        </div>
      </form>
    </div>
  );
}

function DeleteAccountModal({ store, onNavigateToSignup, onClose }: { store: Store; onNavigateToSignup: () => void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await store.deleteAccount(password);
    if (!result.ok) {
      setLoading(false);
      setError(result.error || 'Failed to delete account.');
      return;
    }
    // Account deleted successfully; the store cleared the session, so the
    // app unmounts this modal and returns to the auth screen on its own.
    onNavigateToSignup();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="note-modal delete-account-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button className="close-modal" type="button" onClick={onClose} aria-label="Close delete account dialog"><X size={18} /></button>
        <div className="delete-account-header">
          <AlertTriangle size={32} className="delete-account-icon" />
          <h2 className="delete-account-title">Delete your account?</h2>
        </div>
        <p className="delete-account-warning">This permanently deletes your account and all associated data. This action cannot be undone.</p>
        <label className="settings-field"><span>Current password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Enter your password to confirm" /></label>
        {error && <p className="auth-error">{error}</p>}
        <div className="modal-actions">
          <div className="modal-actions-right">
            <button className="outline-button small-btn" type="button" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="danger-button small-btn delete-btn" type="submit" disabled={loading}>{loading ? 'Deleting...' : 'Delete Account'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function SettingsView({ store, onNavigateToSignup }: { store: Store; onNavigateToSignup?: () => void }) {
  const { data, updateSettings } = store;
  const s = data.settings;
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const initials = (data.user?.name ?? s.displayName).split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const bioWords = useMemo(() => countWords(s.bio), [s.bio]);

  // Local state for pending changes (only sync to backend on explicit save)
  const [pendingBio, setPendingBio] = useState(s.bio);
  const [pendingTimezone, setPendingTimezone] = useState(s.timezone);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Sync local state when data.settings changes from backend
  useEffect(() => {
    setPendingBio(s.bio);
    setPendingTimezone(s.timezone);
  }, [s.bio, s.timezone]);

  // Keep the dropdown consistent with the stored value: if the profile holds a
  // timezone outside the curated list, prepend it so the select never renders
  // blank/mismatched against the actual setting.
  const timezoneOptions = useMemo(
    () => (ianaTimezones.includes(pendingTimezone) ? ianaTimezones : [pendingTimezone, ...ianaTimezones]),
    [pendingTimezone]
  );

  const handleBioChange = (v: string) => {
    const words = countWords(v);
    if (words <= LIMITS.BIO_WORDS) {
      setPendingBio(v);
    }
  };

  const handleTimezoneChange = (v: string) => {
    setPendingTimezone(v);
  };

  const handleSaveChanges = async () => {
    const updates: Partial<SettingsType> = {};
    if (pendingBio !== s.bio) updates.bio = pendingBio;
    if (pendingTimezone !== s.timezone) updates.timezone = pendingTimezone;
    if (Object.keys(updates).length === 0) return;

    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(false);

    // updateSettings maps these to the user profile and issues a single PATCH;
    // it resolves false on failure so the status below is accurate instead of
    // always reporting success.
    const ok = await updateSettings(updates);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } else {
      setSaveError(true);
    }
  };

  const handleDeleteAccountSuccess = () => {
    if (onNavigateToSignup) {
      onNavigateToSignup();
    }
  };

  return (
    <div className="view-content settings-view">
      <div className="view-heading"><div><h1>Settings</h1></div></div>
      <div className="settings-grid">
        <Card icon={User} title="Account / Profile">
          <div className="settings-avatar">
            <div className="avatar-circle">{initials}</div>
            <div><p className="avatar-name">{data.user?.name ?? s.displayName}</p><p className="avatar-email">{s.email}</p></div>
          </div>
          <Field label="Username" value={data.user?.name ?? ''} readOnly hint="Username is permanent and cannot be changed." />
          <Field label="Email" value={s.email} readOnly hint="Email address is permanent and cannot be changed." />
          <SelectField label="Timezone" value={pendingTimezone} options={timezoneOptions} onChange={handleTimezoneChange} />
          <label className="settings-field">
            <span>Bio</span>
            <textarea className="settings-bio" value={pendingBio} onChange={(e) => handleBioChange(e.target.value)} rows={3} />
            <em className="settings-hint">{bioWords} / {LIMITS.BIO_WORDS} words</em>
          </label>
          {saveSuccess && <p className="auth-success-inline" style={{marginTop: '8px'}}>✓ Settings saved successfully</p>}
          {saveError && <p className="auth-error" style={{marginTop: '8px'}}>Could not save settings. Please try again.</p>}
          <button className="primary-button small-btn" onClick={handleSaveChanges} disabled={isSaving || (pendingBio === s.bio && pendingTimezone === s.timezone)}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </Card>

        <Card icon={Globe} title="Preferences">
          <Field label="Language" value="English (US)" readOnly />
          <SelectField label="Date format" value={s.dateFormat} options={['DD-MM-YY', 'MM/DD/YYYY', 'YYYY-MM-DD']} onChange={(v) => updateSettings({ dateFormat: v })} />
          <SelectField label="Start of week" value={s.startOfWeek} options={['Monday', 'Sunday']} onChange={(v) => updateSettings({ startOfWeek: v })} />
          <SelectField label="Time format" value={s.timeFormat} options={['12-hour', '24-hour']} onChange={(v) => updateSettings({ timeFormat: v })} />
        </Card>

        <Card icon={Bell} title="Notifications">
          <Toggle label="Push notifications" desc="Get reminders for upcoming tasks" value={s.pushNotifications} onChange={(v) => updateSettings({ pushNotifications: v })} />
          <Toggle label="Task reminders" desc="Daily reminder of what is due" value={s.taskReminders} onChange={(v) => updateSettings({ taskReminders: v })} />
        </Card>

        <Card icon={Lock} title="Security">
          <button className="settings-action-btn" onClick={() => setShowPasswordModal(true)}><Lock size={15} />Change password</button>
          <button className="settings-action-btn danger-action-btn" onClick={() => setShowDeleteModal(true)}><AlertTriangle size={15} />Delete Account</button>
          <p className="settings-session">Last signed in {new Date().toLocaleDateString()}</p>
        </Card>
      </div>
      {showPasswordModal && <PasswordModal store={store} onClose={() => setShowPasswordModal(false)} />}
      {showDeleteModal && <DeleteAccountModal store={store} onNavigateToSignup={handleDeleteAccountSuccess} onClose={() => setShowDeleteModal(false)} />}
    </div>
  );
}

export default SettingsView;
