// ============================================================
//  js/auth.js  ログイン・ログアウト・新規登録（Cloud Functions版）
//  ★ players / playersMeta への直接書き込みを廃止し、
//    すべて Cloud Functions 経由で行う
// ============================================================
import { auth, dbGet, callFn, toast } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { S, scheduleRender, resetMain } from './ui.js';

// ---- ログイン画面 ----
export function renderLogin() {
  resetMain();
  document.getElementById('app').innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <div class="login-title">🏛 COINS架空市場</div>
      <div class="login-sub">仮想経済マルチプレイヤーゲーム</div>
      <div class="mode-btns">
        <button class="mode-btn ${S.lmode==='login'?'active':''}"
                onclick="W._setMode('login')">ログイン</button>
        <button class="mode-btn ${S.lmode==='register'?'active':''}"
                onclick="W._setMode('register')">新規登録</button>
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
      <button class="btn btn-primary"
              style="width:100%;margin-top:14px;padding:10px"
              onclick="W.login()">
        ${S.lmode==='login' ? 'ログイン' : '登録してプレイ開始'}
      </button>
      <div class="hint" style="margin-top:14px;text-align:center;line-height:1.7">
        パスワードはFirebase Authで安全に管理されます。<br>
        残高の計算はすべてサーバー側（Cloud Functions）で行われます。
      </div>
    </div></div>`;
}

// ---- ログイン・新規登録 ----
export async function login() {
  const email = document.getElementById('l-email')?.value.trim();
  const pass  = document.getElementById('l-pass')?.value.trim();
  const name  = document.getElementById('l-name')?.value.trim();
  if (!email || !pass) {
    S.lerr = 'メールアドレスとパスワードを入力してください';
    renderLogin(); return;
  }
  if (S.lmode==='register' && !name) {
    S.lerr = 'プレイヤー名を入力してください';
    renderLogin(); return;
  }
  S.submitting = true;
  try {
    if (S.lmode==='register') {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const uid  = cred.user.uid;
      // 認証完了を待ってからCloud Functionsでプレイヤー作成
      await new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, user => {
          if (user && user.uid===uid) { unsub(); resolve(); }
        });
      });
      S.uid = uid;
      // ★ Cloud Functions経由でプレイヤーデータを作成（クライアント直接書き込みなし）
      await callFn('registerPlayer', { name });
      toast(`ようこそ、${name}さん！`);
    } else {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      S.uid = cred.user.uid;
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
    S.lerr = msgs[e.code] || e.message || ('functions/'+e.code);
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

// ---- 認証状態の監視 ----
export function initAuth(onLogin, onLogout) {
  onAuthStateChanged(auth, async user => {
    if (user) {
      S.uid = user.uid; S.submitting = false;
      const p = await dbGet(`players/${S.uid}`);
      if (p) {
        S.pname = p.name;
        // 特性が未設定の既存ユーザーには Cloud Functions 経由で付与
        if (!p.trait) {
          try { await callFn('ensureTrait', {}); } catch(_) {}
        }
      }
      onLogin(user);
    } else {
      S.uid = null; S.pname = '';
      onLogout();
    }
  });
}

// ---- 特性変更（Cloud Functions版：サーバー側で2000COIN検証） ----
export async function changeTrait() {
  try {
    const data = await callFn('changeTrait', {});
    const traitMap = {
      worker:'仕事人', manager:'経営者', negotiator:'交渉者',
      balancer:'バランサー', accountant:'会計士',
    };
    toast(`特性が「${traitMap[data.newTrait]}」に変更されました (-2000 COIN)`);
  } catch(e) {
    toast('エラー: ' + e.message);
  }
}
