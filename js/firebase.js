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
  appId: "1:169831544038:web:04e3d06b74be5df7057727",
  measurementId: "G-TZ6F7Y6RDD"
};
// ============================================================

export const app       = initializeApp(FIREBASE_CONFIG);
export const db        = getDatabase(app);
export const auth      = getAuth(app);
const functions        = getFunctions(app, "asia-northeast1"); // 東京リージョン

// ---- DB ヘルパー（読み取り専用） ----
export const dbGet    = async p => { const s=await get(ref(db,p)); return s.exists()?s.val():null; };
export const dbSet    = (p,v)   => set(ref(db,p), v);
export const dbUpdate = (p,v)   => update(ref(db,p), v);

// ---- Cloud Functions 呼び出しラッパー ----
// 各関数を事前にバインドしておく
const _fn = name => httpsCallable(functions, name);

export async function callFn(name, data={}) {
  const fn     = _fn(name);
  const result = await fn(data);
  return result.data;
}

// ---- 後方互換: callApi を callFn に変換 ----
// endpoint名からCloud Functions名へのマッピング
export async function callApi(endpoint, body={}) {
  const map = {
    "ticket.php":  () => callFn("useTicket",       body),
    "deposit.php": () => callFn("deposit",          body),
    "bonus.php":   () => {
      if (body.action === "ticket_check") return callFn("checkTickets",  body);
      if (body.action === "daily_bonus")  return callFn("dailyBonus",    body);
      throw new Error("Unknown bonus action");
    },
    "roulette.php":() => {
      if (body.action === "bet")     return callFn("rouletteBet",     body);
      if (body.action === "process") return callFn("processRoulette", body);
      throw new Error("Unknown roulette action");
    },
    "invest.php":  () => {
      if (body.action === "buy")          return callFn("invest",            body);
      if (body.action === "sell")         return callFn("invest",            body);
      if (body.action === "update_price") return callFn("updateStockPrices", body);
      throw new Error("Unknown invest action");
    },
  };
  const handler = map[endpoint];
  if (!handler) throw new Error(`Unknown endpoint: ${endpoint}`);
  return handler();
}

// ---- ユーティリティ ----
export const r   = n => Math.round(n);
export const fmt = n => Math.round(n).toLocaleString("ja-JP");
export const esc = s => String(s??"").replace(/[&<>"']/g, c=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":'&#39;'}[c]));

export const RED_NUMS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
export const isRed   = n => RED_NUMS.includes(n);
export const isBlack = n => !isRed(n) && n > 0;

export const WHEEL_ORDER = [
  0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,
  37,27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2
];

// ---- 利息計算（会計士バフ適用・表示用） ----
export function calcInterest(p) {
  const now      = Date.now();
  const dRate    = p.trait === "accountant" ? 1.012 : 1.01;
  const tdRate   = p.trait === "accountant" ? 1.024 : 1.02;
  return {
    depBal:  p.deposit
      ? r(p.deposit.principal     * Math.pow(dRate,  (now-p.deposit.since)    /86400000)) : 0,
    tdepBal: p.termDeposit
      ? r(p.termDeposit.principal * Math.pow(tdRate, (now-p.termDeposit.since)/86400000)) : 0,
  };
}
// 後方互換エイリアス
export const calcInterestWithTrait = calcInterest;

// ---- ランキング用スコア ----
export function rankTotal(p) {
  return r((p.coins||0)+(p.deposit?.principal||0)+(p.termDeposit?.principal||0)
          +(p.rouletteBet||0)+(p.investedCost||0));
}

// ---- 全体資産・平均 ----
export function totalAssetsAll(playersMeta) {
  return Math.max(1, Object.values(playersMeta).reduce((s,m)=>s+(m.rankTotal||0),0));
}
export function avgAsset(playersMeta) {
  const metas = Object.values(playersMeta);
  if (!metas.length) return 0;
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

// ---- 逆転ボーナス（特性バフ込み・表示用） ----
export function calcTicketInterval(p, playersMeta) {
  const avg   = avgAsset(playersMeta);
  if (avg <= 0) return 60000;
  const ratio = Math.min(1, rankTotal(p)/avg);
  const base  = r(30000+ratio*30000);
  return p.trait === "worker" ? r(base*0.5) : base;
}
export function calcRareProb(p, playersMeta) {
  if (p.trait === "balancer") return 0.20;
  const avg   = avgAsset(playersMeta);
  if (avg <= 0) return 0.10;
  const ratio = Math.min(1, rankTotal(p)/avg);
  return 0.20 - ratio*0.10;
}

// ---- Firebase リアルタイム購読 ----
export function subscribeAll(uid, callbacks) {
  const unsubs = {};
  const watch  = (path, key, fn) => {
    const rf = ref(db, path);
    if (unsubs[key]) { try { off(rf); } catch(_){} }
    unsubs[key] = onValue(rf, snap => fn(snap.val()));
  };
  watch(`players/${uid}`, "player",   v => callbacks.onPlayer(v));
  watch("playersMeta",    "meta",     v => callbacks.onMeta(v||{}));
  watch("roulette",       "roulette", v => callbacks.onRoulette(v));
  watch("stocks",         "stocks",   v => callbacks.onStocks(v||{}));
  return unsubs;
}

// ---- Toast ----
export function toast(msg, ms=3500) {
  const d = document.createElement("div");
  d.className="toast"; d.textContent=msg;
  document.getElementById("toasts").appendChild(d);
  setTimeout(()=>d.remove(), ms);
}
