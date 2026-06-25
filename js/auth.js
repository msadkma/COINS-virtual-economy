// ============================================================
//  js/auth.js  ログイン・ログアウト・新規登録
// ============================================================
import { auth, dbGet, dbSet, callApi, toast } from './firebase.js';
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { S, scheduleRender, resetMain } from './ui.js';
import { subscribeAll } from './firebase.js';

// ---- ログイン画面レンダリング ----
export function renderLogin() {
  resetMain();
  document.getElementById('app').innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <div class="login-title">🏛 架空市場</div>
      <div class="login-sub">仮想経済マルチプレイヤーゲーム</div>
      <div class="mode-btns">
        <button class="mode-btn ${S.lmode==='login'?'active':''}" onclick="W._setMode('login')">ログイン</button>
        <button class="mode-btn ${S.lmode==='register'?'active':''}" onclick="W._setMode('register')">新規登録</button>
      </div>
      ${S.lmode==='register' ? `<div class="form-group">
        <label class="form-label">プレイヤー名（ゲーム内表示名）</label>
        <input class="input" id="l-name" type="text" placeholder="ニックネーム"
               autocomplete="nickname" style="width:100%"/>
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">メールアドレス <span class="hint">（架空でもOK）</span></label>
        <input class="input" id="l-email" type="email" placeholder="xxx@example.com"
               autocomplete="email" style="width:100%"/>
      </div>
      <div class="form-group">
        <label class="form-label">パスワード <span class="hint">（6文字以上）</span></label>
        <input class="input" id="l-pass" type="password" placeholder="パスワード"
               autocomplete="${S.lmode==='login'?'current-password':'new-password'}"
               style="width:100%" onkeydown="if(event.key==='Enter')W.login()"/>
      </div>
      ${S.lerr ? `<div class="err">${S.lerr}</div>` : ''}
      <button class="btn btn-primary" style="width:100%;margin-top:14px;padding:10px"
              onclick="W.login()">
        ${S.lmode==='login' ? 'ログイン' : '登録してプレイ開始'}
      </button>
      <div class="hint" style="margin-top:14px;text-align:center;line-height:1.7">
        パスワードはFirebase Authで安全に管理されます。<br>
        残高の計算はサーバー側で行われます。
      </div>
    </div></div>`;
}

// ---- ログイン・登録 ----
export async function login() {
  const email = document.getElementById('l-email')?.value.trim();
  const pass  = document.getElementById('l-pass')?.value.trim();
  const name  = document.getElementById('l-name')?.value.trim();
  if (!email || !pass) { S.lerr = 'メールアドレスとパスワードを入力してください'; renderLogin(); return; }
  if (S.lmode === 'register' && !name) { S.lerr = 'プレイヤー名を入力してください'; renderLogin(); return; }

  S.submitting = true;
  try {
    if (S.lmode === 'register') {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const uid  = cred.user.uid;
      const now  = Date.now();
      const np   = {
        id: uid, name, coins: 0, tickets: 0, rareTickets: 0,
        lastTicketTime: now, deposit: null, depositBalance: 0,
        termDeposit: null, termDepositBalance: 0,
        rouletteBet: 0, holdings: {}, investedCost: 0, lastDailyBonus: 0,
      };
      // onAuthStateChanged で認証完了を待ってからDB書き込み
      await new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, user => {
          if (user && user.uid === uid) { unsub(); resolve(); }
        });
      });
      await dbSet(`players/${uid}`, np);
      await pushMeta(np);
      toast(`ようこそ、${name}さん！`);
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast('ログインしました');
    }
    S.lerr = ''; S.tab = 'home';
  } catch(e) {
    const msgs = {
      'auth/email-already-in-use':  'そのメールは既に登録されています',
      'auth/invalid-email':         'メールアドレスの形式が正しくありません',
      'auth/weak-password':         'パスワードは6文字以上にしてください',
      'auth/invalid-credential':    'メールアドレスまたはパスワードが間違っています',
      'auth/user-not-found':        'アカウントが見つかりません',
      'auth/wrong-password':        'パスワードが間違っています',
    };
    S.lerr = msgs[e.code] || e.message;
    S.submitting = false;
    renderLogin();
  }
}

// ---- ログアウト ----
export async function logout() {
  await signOut(auth);
  S.uid = null; S.pname = ''; S.tab = 'home'; S.submitting = false;
  renderLogin();
}

// ---- playersMeta更新 ----
export async function pushMeta(p) {
  if (!S.uid) return;
  const { rankTotal } = await import('./firebase.js');
  const { dbUpdate }  = await import('./firebase.js');
  await dbUpdate(`playersMeta/${S.uid}`, {
    name:      p.name || S.pname,
    rankTotal: rankTotal(p),
    holdings:  p.holdings || {},
    detail: {
      coins: Math.round(p.coins||0),
      dep:   p.deposit?.principal     ? Math.round(p.deposit.principal)     : 0,
      tdep:  p.termDeposit?.principal ? Math.round(p.termDeposit.principal) : 0,
      rbet:  Math.round(p.rouletteBet||0),
      inv:   Math.round(p.investedCost||0),
    },
  });
}

// ---- onAuthStateChanged 初期化 ----
export function initAuth(onLogin, onLogout) {
  onAuthStateChanged(auth, async user => {
    if (user) {
      S.uid = user.uid; S.submitting = false;
      const p = await dbGet(`players/${S.uid}`);
      if (p) { S.pname = p.name; await pushMeta(p); }
      onLogin(user);
    } else {
      S.uid = null; S.pname = '';
      onLogout();
    }
  });
}
