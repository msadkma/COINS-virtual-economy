// ============================================================
//  js/auth.js  ログイン・ログアウト・新規登録
// ============================================================
import { auth, dbGet, dbSet, dbUpdate, rankTotal,
         calcInterest, toast } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { S, scheduleRender, resetMain } from './ui.js';

// ---- 特性ランダム付与 ----
const TRAITS = ['worker','manager','negotiator','balancer','accountant'];
function randomTrait() { return TRAITS[Math.floor(Math.random()*TRAITS.length)]; }

// ---- playersMeta更新（利息込みの表示資産も保存） ----
export async function pushMeta(p) {
  if (!S.uid) return;
  const {depBal, tdepBal} = calcInterest(p);
  let invVal = 0;
  const stocks = S.stocks || {};
  for (const [sym,qty] of Object.entries(p.holdings||{}))
    if (stocks[sym]) invVal += stocks[sym].price*(qty||0);

  // ランキング基準スコア（元本ベース・利息なし）
  const rt = rankTotal(p);
  // 表示用総資産（利息・評価額込み）
  const displayTotal = Math.round((p.coins||0) + depBal + tdepBal + (p.rouletteBet||0) + invVal);

  await dbUpdate(`playersMeta/${S.uid}`, {
    name:         p.name || S.pname,
    rankTotal:    rt,
    displayTotal: displayTotal,
    holdings:     p.holdings || {},
    trait:        p.trait || null,
    detail: {
      coins: Math.round(p.coins      || 0),
      dep:   Math.round(p.deposit?.principal     || 0),
      tdep:  Math.round(p.termDeposit?.principal || 0),
      rbet:  Math.round(p.rouletteBet|| 0),
      inv:   Math.round(p.investedCost|| 0),
    },
  });
}

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
        パスワードはFirebase Authで安全に管理されます。
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
      const now  = Date.now();
      const np   = {
        id: uid, name,
        coins: 0, tickets: 0, rareTickets: 0,
        lastTicketTime: now,
        deposit: null, depositBalance: 0,
        termDeposit: null, termDepositBalance: 0,
        rouletteBet: 0, holdings: {}, investedCost: 0,
        lastDailyBonus: 0,
        trait: randomTrait(), // ← 登録時にランダム特性を付与
      };
      await new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, user => {
          if (user && user.uid===uid) { unsub(); resolve(); }
        });
      });
      await dbSet(`players/${uid}`, np);
      S.uid = uid;
      await pushMeta(np);
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

// ---- 認証状態の監視 ----
export function initAuth(onLogin, onLogout) {
  onAuthStateChanged(auth, async user => {
    if (user) {
      S.uid = user.uid; S.submitting = false;
      let p = await dbGet(`players/${S.uid}`);
      // 既存ユーザーに特性が未設定の場合は付与
      if (p && !p.trait) {
        const trait = randomTrait();
        await dbUpdate(`players/${S.uid}`, { trait });
        p = { ...p, trait };
      }
      if (p) { S.pname = p.name; await pushMeta(p); }
      onLogin(user);
    } else {
      S.uid = null; S.pname = '';
      onLogout();
    }
  });
}

// ---- 特性変更 ----
export async function changeTrait() {
  const p = await dbGet(`players/${S.uid}`);
  if (!p) return;
  if ((p.coins||0) < 2000) { toast('2000 COINが必要です'); return; }
  const TRAITS = ['worker','manager','negotiator','balancer','accountant'];
  const current = p.trait;
  // 現在と違う特性をランダムに選ぶ
  let newTrait;
  do { newTrait = TRAITS[Math.floor(Math.random()*TRAITS.length)]; }
  while (newTrait === current);
  await dbUpdate(`players/${S.uid}`, {
    coins: Math.round((p.coins||0) - 2000),
    trait: newTrait,
  });
  const traitMap = {
    worker:'仕事人', manager:'経営者', negotiator:'交渉者',
    balancer:'バランサー', accountant:'会計士',
  };
  toast(`特性が「${traitMap[newTrait]}」に変更されました (-2000 COIN)`);
  await pushMeta({ ...p, coins: Math.round((p.coins||0)-2000), trait: newTrait });
}
