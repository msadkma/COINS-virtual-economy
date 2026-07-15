// ============================================================
//  js/firebase.js  Firebase初期化・Cloud Functions呼び出し版
// ============================================================
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, update, onValue, off }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFunctions, httpsCallable }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

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
  appId: "1:169831544038:web:04e3d06b7"
};

export const app  = initializeApp(FIREBASE_CONFIG);
export const db   = getDatabase(app);
export const auth = getAuth(app);

// ---- ユーティリティ ----
export function r(n)   { return Math.round(n); }
export function fmt(n) { return Number(n).toLocaleString(); }
export function esc(s) {
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- 資産計算系 ----
export function rankTotal(p) {
  return r(
    (p.coins||0) +
    (p.deposit?.principal||0) +
    (p.termDeposit?.principal||0) +
    (p.rouletteBet||0) +
    (p.investedCost||0)
  );
}
export function totalAssetsAll(playersMeta) {
  let sum = 0;
  for (const k in playersMeta) { sum += (playersMeta[k].rankTotal || 0); }
  return Math.max(1, sum);
}
export function avgAsset(playersMeta) {
  const metas = Object.values(playersMeta);
  if (metas.length === 0) return 0;
  return totalAssetsAll(playersMeta) / metas.length;
}

// ---- 賭け上限（修正版） ----
export function calcBetLimit(p, playersMeta) {
  const my    = rankTotal(p);
  const all   = totalAssetsAll(playersMeta);
  const count = Object.keys(playersMeta).length;
  if (count <= 1) return Math.max(0, r(my*0.5));
  const myRatio = my/all;
  return Math.max(0, r(my*(1-myRatio)));
}
export function currentBetUsage(p) {
  return r((p.rouletteBet||0)+(p.investedCost||0));
}

// ---- 逆転ボーナスは廃止（デイリーボーナスのみに集約） ----
// チケット間隔・レア確率は特性のみで決まる
export function calcTicketInterval(p) {
  return p.trait === "worker" ? Math.round(60000 * (2/3)) : 60000;
}
export function calcRareProb(p) {
  return p.trait === "balancer" ? 0.20 : 0.10;
}

// ---- Firebase リアルタイム購読 ----
export function subscribeAll(uid, callbacks) {
  const unsubs = {};
  const watch  = (path, key, fn) => {
    const rf = ref(db, path);
    if (unsubs[key]) { try { off(rf); } catch(_){} }
    unsubs[key] = onValue(rf, snap => fn(snap.val()));
  };

  watch(`players/${uid}`, 'player', callbacks.onPlayer);
  watch('playersMeta',    'meta',   callbacks.onMeta);
  watch('stocks',         'stocks', callbacks.onStocks);
  watch('roulette',       'roulette', callbacks.onRoulette);

  return () => {
    for (const k in unsubs) { try { off(ref(db, k === 'player' ? `players/${uid}` : k)); } catch(_){} }
  };
}

// ============================================================
//  ★【安全な追記】PHP通信用共通API関数（deposit.php呼び出し用）★
// ============================================================
export async function callFn(endpoint, data = {}) {
  try {
    const user = auth.currentUser;
    const token = user ? await user.getIdToken() : "";

    const response = await fetch(`${endpoint}.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const resData = await response.json();
    if (!response.ok || !resData.ok) {
      throw new Error(resData.error || `通信エラー (${response.status})`);
    }
    return resData;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}
