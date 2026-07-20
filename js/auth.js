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
      </div>
      <div class="form-group">
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;
                    padding:10px 12px;margin-bottom:8px">
          <div style="font-weight:700;font-size:13px;color:#856404;margin-bottom:4px">
            ⚠️ 本名の入力が必要です
          </div>
          <div style="font-size:12px;color:#856404;line-height:1.6">
            このプラットフォームは限られたメンバーのみが参加しています。
            なりすましや複数アカウントを防ぐため、<strong>必ず本名を入力してください。</strong>
            入力された本名は運営者のみが確認できます。偽名での登録は参加資格の剥奪対象となります。
          </div>
        </div>
        <label class="form-label">本名 <span style="color:#c0392b">*必須</span></label>
        <input class="input" id="l-realname" type="text" placeholder="山田 太郎"
               autocomplete="name" style="width:100%"/>
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
  const email    = document.getElementById('l-email')?.value.trim();
  const pass     = document.getElementById('l-pass')?.value.trim();
  const name     = document.getElementById('l-name')?.value.trim();
  const realName = document.getElementById('l-realname')?.value.trim();
  if (!email || !pass) {
    S.lerr = 'メールアドレスとパスワードを入力してください';
    renderLogin(); return;
  }
  if (S.lmode==='register' && !name) {
    S.lerr = 'プレイヤー名を入力してください';
    renderLogin(); return;
  }
  if (S.lmode==='register' && !realName) {
    S.lerr = '本名を入力してください（必須）';
    renderLogin(); return;
  }
  S.submitting = true;
  try {
    if (S.lmode==='register') {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const uid  = cred.user.uid;
      await new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, user => {
          if (user && user.uid===uid) { unsub(); resolve(); }
        });
      });
      S.uid = uid;
      // 本名も一緒にサーバーへ送信（DBのplayers/{uid}/realNameに保存）
      await callFn('registerPlayer', { name, realName });
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
let _pendingOnLogin  = null;
let _pendingOnLogout = null;

export function initAuth(onLogin, onLogout) {
  _pendingOnLogin  = onLogin;
  _pendingOnLogout = onLogout;
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
        // 本名未登録の既存ユーザーには本名入力モーダルを表示
        if (!p.realName) {
          showRealNameModal();
          return; // モーダル送信後に _pendingOnLogin が呼ばれる
        }
      }
      onLogin(user);
    } else {
      S.uid = null; S.pname = '';
      onLogout();
    }
  });
}

// ---- 本名入力モーダル（既存ユーザー用） ----
let _onLoginCallback = null;
export function showRealNameModal() {
  const existing = document.getElementById('realname-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'realname-modal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:700;
    display:flex;align-items:center;justify-content:center;padding:20px`;
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:28px;
                max-width:360px;width:100%">
      <div style="font-size:18px;font-weight:800;margin-bottom:8px">
        ⚠ 本名の登録が必要です
      </div>
      <div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:16px">
        このプラットフォームは限られたメンバーのみが参加しています。<br>
        不正行為（複数アカウント・なりすまし）を防ぐため、<strong>必ず本名を入力してください。</strong><br>
        入力された本名は運営者のみが確認できます。
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:700;color:#555;
                      display:block;margin-bottom:6px">本名（フルネーム）</label>
        <input id="modal-realname" class="input" type="text"
               placeholder="例: 山田 太郎" style="width:100%"
               onkeydown="if(event.key==='Enter')W._submitRealName()"/>
      </div>
      <div id="modal-realname-err" style="color:#c0392b;font-size:12px;
           margin-bottom:8px;display:none"></div>
      <button class="btn btn-primary" style="width:100%;padding:10px"
              onclick="W._submitRealName()">登録して続ける</button>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('modal-realname')?.focus(), 100);
}

export async function submitRealName() {
  const realName = document.getElementById('modal-realname')?.value.trim();
  const errEl    = document.getElementById('modal-realname-err');
  if (!realName) {
    if (errEl) { errEl.textContent = '本名を入力してください'; errEl.style.display='block'; }
    return;
  }
  try {
    await callFn('updateRealName', { realName });
    document.getElementById('realname-modal')?.remove();
    // 保存しておいたコールバックを実行してゲーム画面へ遷移
    if (_pendingOnLogin) {
      const user = auth.currentUser;
      if (user) await _pendingOnLogin(user);
    }
  } catch(e) {
    if (errEl) { errEl.textContent = 'エラー: ' + e.message; errEl.style.display='block'; }
  }
}

// ---- 特性情報 ----
export const TRAIT_INFO = {
  worker:    { label:'仕事人',    color:'#e74c3c', icon:'⚒', buff:'チケット生成速度が通常の1.5倍（40秒/枚）' },
  manager:   { label:'経営者',    color:'#2980b9', icon:'👔', buff:'1位補正ボーナスを2倍受け取る' },
  negotiator:{ label:'交渉者',    color:'#f39c12', icon:'🤝', buff:'株価への購入影響力が2倍' },
  balancer:  { label:'バランサー',color:'#27ae60', icon:'⚖', buff:'レアチケット確率+10%（通常10%→20%）' },
  accountant:{ label:'会計士',    color:'#8e44ad', icon:'📊', buff:'預金1.2%/日・定期2.4%/日（通常の1.2倍）' },
};

// ---- 特性変更モーダルを表示 ----
export function showTraitModal(currentTrait) {
  const existing = document.getElementById('trait-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'trait-modal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:600;
    display:flex;align-items:center;justify-content:center;padding:20px`;
  const cards = Object.entries(TRAIT_INFO).map(([key, t]) => {
    const isCurrent = key === currentTrait;
    return `<div style="border:2px solid ${isCurrent ? t.color : '#e0ddd8'};border-radius:10px;
                padding:12px;cursor:${isCurrent?'default':'pointer'};background:${isCurrent?'#f9f8f6':'#fff'};
                opacity:${isCurrent?'0.6':'1'}"
              onclick="${isCurrent ? '' : `W._selectTrait('${key}')`}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:20px">${t.icon}</span>
        <span style="font-weight:700;color:${t.color}">${t.label}</span>
        ${isCurrent ? '<span style="font-size:11px;background:#e0ddd8;padding:2px 6px;border-radius:4px">現在</span>' : ''}
      </div>
      <div style="font-size:12px;color:#555">${t.buff}</div>
    </div>`;
  }).join('');
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:100%">
      <div style="font-weight:800;font-size:16px;margin-bottom:6px">特性を選択（2000 COIN）</div>
      <div style="font-size:12px;color:#888;margin-bottom:16px">現在の特性とは異なる特性を選んでください</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">${cards}</div>
      <button onclick="document.getElementById('trait-modal').remove()"
        style="width:100%;padding:9px;border:1px solid #ccc;border-radius:7px;
               background:#fff;cursor:pointer;font-size:13px">キャンセル</button>
    </div>`;
  document.body.appendChild(modal);
}

// ---- 特性変更実行 ----
export async function changeTrait(newTrait) {
  try {
    const data = await callFn('changeTrait', { newTrait });
    const t = TRAIT_INFO[data.newTrait];
    document.getElementById('trait-modal')?.remove();
    toast(`特性が「${t.label}」に変更されました (-2000 COIN)`);
  } catch(e) {
    toast('エラー: ' + e.message);
  }
}
