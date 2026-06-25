// ============================================================
//  js/firebase.js  Firebase初期化・共通ユーティリティ
// ============================================================
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, update, onValue, off }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ============================================================
//  ★ ここに Firebase の設定を貼り付けてください ★
// ============================================================
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAoldTnCCTDdIGMA_Q3zeEf8fNGmZWPo7g",
  authDomain: "unreal-economic-platform.firebaseapp.com",
  databaseURL: "https://unreal-economic-platform-default-rtdb.firebaseio.com",
  projectId: "unreal-economic-platform",
  storageBucket: "unreal-economic-platform.firebasestorage.app",
  messagingSenderId: "169831544038",
  appId: "1:169831544038:web:04e3d06b74be5df7057727",
  measurementId: "G-TZ6F7Y6RDD"
};

// ★ PHP APIのベースURL（InfinityFree等のURL）
export const API_BASE = "https://if0_42264124.infinityfreeapp.com/api";
// ============================================================

export const app  = initializeApp(FIREBASE_CONFIG);
export const db   = getDatabase(app);
export const auth = getAuth(app);

// ---- DB ヘルパー（読み取り専用） ----
export const dbGet = async p => {
  const s = await get(ref(db, p));
  return s.exists() ? s.val() : null;
};
export const dbSet    = (p, v) => set(ref(db, p), v);
export const dbUpdate = (p, v) => update(ref(db, p), v);

// ---- PHP API呼び出し ----
export async function callApi(endpoint, body = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API error');
  return data;
}

// ---- ユーティリティ ----
export const r   = n => Math.round(n);
export const fmt = n => Math.round(n).toLocaleString('ja-JP');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

export const RED_NUMS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
export const isRed   = n => RED_NUMS.includes(n);
export const isBlack = n => !isRed(n) && n > 0;

export const WHEEL_ORDER = [
  0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,
  37,27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2
];

// ---- 利息計算（表示用） ----
export function calcInterest(p) {
  const now = Date.now();
  return {
    depBal:  p.deposit     ? r(p.deposit.principal     * Math.pow(1.01, (now - p.deposit.since)     / 86400000)) : 0,
    tdepBal: p.termDeposit ? r(p.termDeposit.principal * Math.pow(1.02, (now - p.termDeposit.since) / 86400000)) : 0,
  };
}

// ---- ランキング用スコア ----
export function rankTotal(p) {
  return r((p.coins||0) + (p.deposit?.principal||0) + (p.termDeposit?.principal||0)
         + (p.rouletteBet||0) + (p.investedCost||0));
}

// ---- 全体資産・平均 ----
export function totalAssetsAll(playersMeta) {
  return Math.max(1, Object.values(playersMeta).reduce((s, m) => s + (m.rankTotal||0), 0));
}
export function avgAsset(playersMeta) {
  const metas = Object.values(playersMeta);
  if (!metas.length) return 0;
  return totalAssetsAll(playersMeta) / metas.length;
}

// ---- 賭け上限 ----
export function calcBetLimit(p, playersMeta) {
  const my  = rankTotal(p);
  const all = totalAssetsAll(playersMeta);
  return Math.max(0, r(my * (1 - my / all)));
}
export function currentBetUsage(p) {
  return r((p.rouletteBet||0) + (p.investedCost||0));
}

// ---- 逆転ボーナス ----
export function calcTicketInterval(p, playersMeta) {
  const avg = avgAsset(playersMeta);
  if (avg <= 0) return 60000;
  const ratio = Math.min(1, rankTotal(p) / avg);
  return r(30000 + ratio * 30000);
}
export function calcRareProb(p, playersMeta) {
  const avg = avgAsset(playersMeta);
  if (avg <= 0) return 0.10;
  const ratio = Math.min(1, rankTotal(p) / avg);
  return 0.20 - ratio * 0.10;
}

// ---- Firebase リアルタイム購読 ----
export function subscribeAll(uid, callbacks) {
  const unsubs = {};
  const watch = (path, key, fn) => {
    const rf = ref(db, path);
    if (unsubs[key]) { try { off(rf); } catch(_){} }
    unsubs[key] = onValue(rf, snap => fn(snap.val()));
  };
  watch(`players/${uid}`, 'player',   v => callbacks.onPlayer(v));
  watch('playersMeta',    'meta',     v => callbacks.onMeta(v || {}));
  watch('roulette',       'roulette', v => callbacks.onRoulette(v));
  watch('stocks',         'stocks',   v => callbacks.onStocks(v || {}));
  return unsubs;
}

// ---- Toast ----
export function toast(msg, ms = 3500) {
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg;
  document.getElementById('toasts').appendChild(d);
  setTimeout(() => d.remove(), ms);
}
