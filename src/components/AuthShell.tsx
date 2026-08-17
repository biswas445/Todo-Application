import { useState } from 'react';
import { ArrowLeft, CheckCircle, Eye, EyeOff, Sparkles } from 'lucide-react';
import type { Store } from '@/store/useAppStore';

type AuthView = 'welcome' | 'signin' | 'signup';

function BrandArtwork({ variant = 0 }: { variant?: number }) {
  return (
    <div className={`brand-art art-${variant}`} aria-hidden="true">
      <div className="orb orb-one" /><div className="orb orb-two" /><div className="orb orb-three" /><div className="orb orb-four" />
      <div className="art-line line-one" /><div className="art-line line-two" />
      <div className="art-ring ring-one" /><div className="art-ring ring-two" />
      <div className="art-dot dot-one" /><div className="art-dot dot-two" /><div className="art-dot dot-three" />
    </div>
  );
}

function AuthShell({ view, onView, store }: { view: AuthView; onView: (view: AuthView) => void; store: Store }) {
  const isWelcome = view === 'welcome';
  const isSignup = view === 'signup';

  const [signinEmail, setSigninEmail] = useState('');
  const [signinPassword, setSigninPassword] = useState('');
  const [signinError, setSigninError] = useState('');
  const [signinShow, setSigninShow] = useState(false);

  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupShow, setSignupShow] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSignIn = (event: React.FormEvent) => {
    event.preventDefault();
    setSigninError('');
    const result = store.signIn(signinEmail, signinPassword);
    if (!result.ok) { setSigninError(result.error || 'Sign in failed.'); }
  };

  const handleSignUp = (event: React.FormEvent) => {
    event.preventDefault();
    setSignupError('');
    setSignupSuccess(false);
    const result = store.signUp(signupName, signupEmail, signupPassword);
    if (!result.ok) { setSignupError(result.error || 'Sign up failed.'); return; }
    setSignupSuccess(true);
    setSignupName(''); setSignupEmail(''); setSignupPassword('');
    onView('signin');
  };

  const switchView = (target: AuthView) => {
    setSigninError(''); setSignupError(''); setSignupSuccess(false);
    onView(target);
  };

  return (
    <main className="auth-page">
      <section className="auth-panel brand-panel">
        <div className="brand-lockup">Organic<br />Mind</div>
        <BrandArtwork variant={view === 'signin' ? 1 : 0} />
      </section>
      <section className="auth-panel auth-form-panel">
        {isWelcome ? (
          <div className="auth-copy welcome-copy">
            <p className="eyebrow"><Sparkles size={14} /> Make space for what matters</p>
            <h1>Productive Mind</h1>
            <p>With only the features you need, Organic Mind is customized for individuals seeking a stress-free way to stay focused on their goals, projects, and tasks.</p>
            <button className="primary-button" onClick={() => switchView('signin')}>Get Started</button>
            <button className="text-button" onClick={() => switchView('signin')}>Already have an account? <strong>Sign in</strong></button>
          </div>
        ) : (
          <form className="auth-copy" onSubmit={isSignup ? handleSignUp : handleSignIn}>
            <button className="back-button" type="button" onClick={() => switchView('welcome')}><ArrowLeft size={16} /> Back</button>
            <h1>{isSignup ? 'Create account' : 'Sign in'}</h1>
            {isSignup && <p className="form-intro">A calmer place to collect your tasks, plans, and ideas.</p>}
            {!isSignup && signupSuccess && (
              <p className="auth-success"><CheckCircle size={16} /> Account created successfully. Please sign in.</p>
            )}
            {isSignup && (
              <label>Name<input type="text" placeholder="Your name" value={signupName} onChange={(e) => setSignupName(e.target.value)} required /></label>
            )}
            {isSignup ? (
              <>
                <label>Email<input type="email" placeholder="email.email@mail.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required /></label>
                <label className="settings-field">Password<div className="password-field"><input type={signupShow ? 'text' : 'password'} placeholder="Enter your password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required autoComplete="new-password" /><button type="button" onClick={() => setSignupShow(!signupShow)} aria-label="Toggle password visibility">{signupShow ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
              </>
            ) : (
              <>
                <label>Email<input type="email" placeholder="email.email@mail.com" value={signinEmail} onChange={(e) => setSigninEmail(e.target.value)} required /></label>
                <label className="settings-field">Password<div className="password-field"><input type={signinShow ? 'text' : 'password'} placeholder="Enter your password" value={signinPassword} onChange={(e) => setSigninPassword(e.target.value)} required autoComplete="current-password" /><button type="button" onClick={() => setSigninShow(!signinShow)} aria-label="Toggle password visibility">{signinShow ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
              </>
            )}
            {!isSignup && signinError && <p className="auth-error">{signinError}</p>}
            {isSignup && signupError && <p className="auth-error">{signupError}</p>}
            <button className="primary-button" type="submit">{isSignup ? 'Sign up' : 'Sign in'}</button>
            <button className="text-button" type="button" onClick={() => switchView(isSignup ? 'signin' : 'signup')}>{isSignup ? 'Already have an account? ' : "Don't have an account? "}<strong>{isSignup ? 'Sign in' : 'Sign up'}</strong></button>
          </form>
        )}
      </section>
    </main>
  );
}
export default AuthShell;
