// Auth: sign-in flow and password setup.

import { sb } from './db.js';
import { $view, $pBody, setHead, panelHead, pwField, bindEyes, toast } from './ui.js';
import { esc } from './utils.js';
import { state } from './config.js';

// ---------- login ----------
export function renderLogin(step = 'email', email = '') {
  setHead({ kicker: step === 'email' ? 'Sign in' : 'Sign in · step 2', title: 'Network' });
  $view.innerHTML = step === 'email' ? `
    <div class="login">
      <p>Sign in once. Your phone keeps you signed in.</p>
      <form id="f">
        <label class="lbl" for="email" style="margin:0">Email</label>
        <input class="field" type="email" id="email" name="username" required autocomplete="username" autocapitalize="off" autocorrect="off" placeholder="you@email.com" value="${esc(email)}">
        <label class="lbl" for="pw" style="margin:6px 0 0">Password</label>
        ${pwField('pw', 'password', 'current-password', 'Password')}
        <button class="btn primary" id="go">Sign in</button>
      </form>
      <p class="alt"><a href="#" id="linkInstead">No password yet? Email me a sign-in link</a></p>
    </div>` : `
    <div class="login">
      <p>We sent a sign-in link to <b style="color:var(--text)">${esc(email)}</b>.</p>
      <p style="font-size:13.5px">In a browser: just tap the link.<br>In the home-screen app: long-press the link in the email, tap <b style="color:var(--text)">Copy Link</b>, and paste it here.</p>
      <form id="f"><input class="field" id="code" required placeholder="Paste link (or code)" autocomplete="one-time-code">
      <button class="btn primary" id="go">Sign in</button></form>
      <p class="alt"><a href="#" id="again">Back</a></p>
    </div>`;
  const f = document.getElementById('f');
  bindEyes($view);
  if (step === 'email') {
    const sendLink = async () => {
      const em = document.getElementById('email').value.trim();
      if (!em) { toast('Enter your email first', true); return; }
      const { error } = await sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
      if (error) { toast(error.message, true); return; }
      renderLogin('code', em);
    };
    document.getElementById('linkInstead').onclick = (e) => { e.preventDefault(); sendLink(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const em = document.getElementById('email').value.trim(), pw = document.getElementById('pw').value;
      if (!pw) return sendLink();
      document.getElementById('go').disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
      if (error) { toast(error.message === 'Invalid login credentials' ? "Wrong password (or none set yet: use the email link)" : error.message, true); document.getElementById('go').disabled = false; }
    };
  } else {
    document.getElementById('again').onclick = (e) => { e.preventDefault(); renderLogin('email', email); };
    f.onsubmit = async (e) => {
      e.preventDefault(); document.getElementById('go').disabled = true;
      const raw = document.getElementById('code').value.trim();
      let res;
      if (/^https?:\/\//.test(raw)) {
        const u = new URL(raw);
        const hash = u.searchParams.get('token') || u.searchParams.get('token_hash');
        const type = u.searchParams.get('type') || 'magiclink';
        if (!hash) { toast("That link doesn't look like the sign-in link", true); document.getElementById('go').disabled = false; return; }
        res = await sb.auth.verifyOtp({ token_hash: hash, type });
      } else {
        res = await sb.auth.verifyOtp({ email, token: raw.replace(/\D/g, ''), type: 'email' });
      }
      const { error } = res;
      if (error) { toast(error.message, true); document.getElementById('go').disabled = false; }
    };
  }
}

// ---------- password (panel) ----------
export function renderPassword() {
  panelHead({ kicker: 'Account', title: 'Password' });
  const email = state.session?.user?.email || '';
  const root = $pBody;
  root.innerHTML = `<form class="card form" id="pf">
    <p class="hint" style="margin-top:12px">Set a password so signing in on a new device (or after signing out) is one tap with Face ID instead of an email link. Let your iPhone suggest a strong password and save it.</p>
    <label class="lbl">Account</label><input type="email" name="username" autocomplete="username" value="${esc(email)}" readonly class="field">
    <label class="lbl">New password</label>${pwField('np', 'new-password', 'new-password', 'At least 8 characters', 'required minlength="8"')}
    <p class="hint">Tap Show to check it before saving.</p>
    <div class="actions" style="margin-top:16px"><button class="btn primary">Save password</button></div></form>`;
  bindEyes(root);
  document.getElementById('pf').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    const { error } = await sb.auth.updateUser({ password: document.getElementById('np').value });
    if (error) { toast(error.message, true); e.submitter && (e.submitter.disabled = false); return; }
    toast('Password saved ✓'); location.hash = '#/today';
  };
}
