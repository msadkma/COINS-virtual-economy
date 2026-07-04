// ============================================================
//  functions/index.js  COINS架空市場 Cloud Functions
//
//  【デプロイ手順】
//  1. npm install -g firebase-tools
//  2. firebase login
//  3. このファイルがある functions/ フォルダで:
//     cd functions && npm install
//  4. プロジェクトルートで:
//     firebase deploy --only functions
// ============================================================
"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule }         = require("firebase-functions/v2/scheduler");
const { setGlobalOptions }   = require("firebase-functions/v2");
const admin                  = require("firebase-admin");

admin.initializeApp();
const db = admin.database();

// リージョン設定（東京）とCORSオプション
setGlobalOptions({ region: "asia-northeast1" });

// onCall関数の共通オプション（CORS許可設定）
const CALL_OPTS = {
  cors: [
    "https://msadkma.github.io",
    /https:\/\/.*\.github\.io$/,
  ],
};

// ============================================================
//  定数
// ============================================================
const RED_NUMS    = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const WHEEL_ORDER = [0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,
                     37,27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2];
const TRAITS      = ["worker","manager","negotiator","balancer","accountant"];

// ============================================================
//  ヘルパー
// ============================================================
const r    = n => Math.round(n);
const isRed   = n => RED_NUMS.includes(n);
const isBlack = n => !isRed(n) && n > 0;

// DBの読み書き
async function dbGet(path)       { const s = await db.ref(path).get(); return s.exists() ? s.val() : null; }
async function dbSet(path, val)  { await db.ref(path).set(val); }
async function dbPatch(path, val){ await db.ref(path).update(val); }

// 認証チェック
function requireAuth(context) {
  if (!context.auth) throw new HttpsError("unauthenticated", "ログインが必要です");
  return context.auth.uid;
}

// ランキング用スコア
function rankTotal(p) {
  return r((p.coins||0) + (p.deposit?.principal||0) + (p.termDeposit?.principal||0)
          + (p.rouletteBet||0) + (p.investedCost||0));
}

// 全体資産合計
async function totalAssetsAll() {
  const meta = await dbGet("playersMeta") || {};
  return Math.max(1, Object.values(meta).reduce((s,m) => s+(m.rankTotal||0), 0));
}

// 平均資産
async function avgAsset() {
  const meta   = await dbGet("playersMeta") || {};
  const metas  = Object.values(meta);
  if (!metas.length) return 0;
  return metas.reduce((s,m) => s+(m.rankTotal||0), 0) / metas.length;
}

// 賭け上限
function calcBetLimitLocal(myRt, allTotal, count) {
  if (count <= 1) return Math.max(0, r(myRt * 0.5));
  const myRatio = myRt / allTotal;
  return Math.max(0, r(myRt * (1 - myRatio)));
}

// チケット間隔（特性バフ込み）
function ticketInterval(p, avg) {
  if (avg <= 0) return 60000;
  const ratio = Math.min(1, rankTotal(p)/avg);
  const base  = r(30000 + ratio*30000);
  return p.trait === "worker" ? r(base*0.5) : base;
}

// レアチケット確率（特性バフ込み）
function rareProb(p, avg) {
  if (p.trait === "balancer") return 0.20;
  if (avg <= 0) return 0.10;
  const ratio = Math.min(1, rankTotal(p)/avg);
  return 0.20 - ratio*0.10;
}

// 利率（会計士バフ込み）
function depositRate(p)     { return p.trait === "accountant" ? 1.012 : 1.01; }
function termDepositRate(p) { return p.trait === "accountant" ? 1.024 : 1.02; }

// playersMeta 更新
async function pushMeta(uid, p) {
  const depBal  = p.deposit
    ? r(p.deposit.principal * Math.pow(depositRate(p),
        (Date.now()-p.deposit.since)/86400000)) : 0;
  const tdepBal = p.termDeposit
    ? r(p.termDeposit.principal * Math.pow(termDepositRate(p),
        (Date.now()-p.termDeposit.since)/86400000)) : 0;
  await dbPatch(`playersMeta/${uid}`, {
    name:      p.name || "",
    rankTotal: rankTotal(p),
    holdings:  p.holdings || {},
    trait:     p.trait || null,
    detail: {
      coins: r(p.coins||0),
      dep:   r(p.deposit?.principal     || 0),
      tdep:  r(p.termDeposit?.principal || 0),
      rbet:  r(p.rouletteBet  || 0),
      inv:   r(p.investedCost || 0),
    },
  });
}

// ルーレット払い戻し計算
function calcWin(type, result, amt) {
  const a=r(amt), n=result;
  const m = type.match(/^num_(-?\d+)$/);
  if (m) return parseInt(m[1])===n ? a*36 : 0;
  if (type==="red")   return n>0&&isRed(n)   ? a*2 : 0;
  if (type==="black") return n>0&&isBlack(n) ? a*2 : 0;
  if (type==="even")  return n>0&&n%2===0    ? a*2 : 0;
  if (type==="odd")   return n>0&&n%2!==0    ? a*2 : 0;
  if (type==="low")   return n>=1&&n<=18     ? a*2 : 0;
  if (type==="high")  return n>=19&&n<=36    ? a*2 : 0;
  if (type==="col1")  return n>0&&n%3===1    ? a*3 : 0;
  if (type==="col2")  return n>0&&n%3===2    ? a*3 : 0;
  if (type==="col3")  return n>0&&n%3===0    ? a*3 : 0;
  if (type==="doz1")  return n>=1&&n<=12     ? a*3 : 0;
  if (type==="doz2")  return n>=13&&n<=24    ? a*3 : 0;
  if (type==="doz3")  return n>=25&&n<=36    ? a*3 : 0;
  return 0;
}

// 全5特性が揃っているか
function hasAllTraits(owners, meta) {
  const traits = new Set();
  for (const uid of Object.keys(owners||{})) {
    const t = meta[uid]?.trait;
    if (t) traits.add(t);
  }
  return TRAITS.every(t => traits.has(t));
}

// ============================================================
//  初期データ作成（ゲーム全体の初回セットアップ用）
//  ログイン後にクライアントから1回だけ呼ばれる想定
// ============================================================
exports.ensureGameDefaults = onCall(CALL_OPTS, async (request) => {
  requireAuth(request);
  if (!await dbGet("roulette")) {
    await dbSet("roulette", { next: Date.now()+3600000, bets:{}, last:null, processing:false });
  }
  if (!await dbGet("stocks")) {
    const now = Date.now();
    await dbSet("stocks", {
      ALPHA:{ name:"Alpha Corp", price:100, history:[100], nextUpdate:now+43200000 },
      BETA: { name:"Beta Inc",   price:80,  history:[80],  nextUpdate:now+43200000 },
      GAMMA:{ name:"Gamma Ltd",  price:50,  history:[50],  nextUpdate:now+43200000 },
    });
  }
  if (!await dbGet("companies")) {
    await dbSet("companies", {});
  }
  return { ok:true };
});


exports.registerPlayer = onCall(CALL_OPTS, async (request) => {
  const uid  = requireAuth(request);
  const { name } = request.data;
  if (!name || !name.trim()) throw new HttpsError("invalid-argument","プレイヤー名が必要です");

  const existing = await dbGet(`players/${uid}`);
  if (existing) throw new HttpsError("already-exists","既に登録済みです");

  const now = Date.now();
  const trait = TRAITS[Math.floor(Math.random()*TRAITS.length)];
  const np = {
    id: uid, name: name.trim(),
    coins: 0, tickets: 0, rareTickets: 0,
    lastTicketTime: now,
    deposit: null, depositBalance: 0,
    termDeposit: null, termDepositBalance: 0,
    rouletteBet: 0, holdings: {}, investedCost: 0,
    lastDailyBonus: 0, lastFirstBonus: 0,
    trait,
  };
  await dbSet(`players/${uid}`, np);
  await pushMeta(uid, np);
  return { ok:true, trait };
});

// ============================================================
//  特性が未設定の既存ユーザーへの付与（ログイン時に呼ばれる）
// ============================================================
exports.ensureTrait = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const p   = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  if (p.trait) return { trait: p.trait, changed:false };
  const trait = TRAITS[Math.floor(Math.random()*TRAITS.length)];
  await dbPatch(`players/${uid}`, { trait });
  await pushMeta(uid, {...p, trait});
  return { trait, changed:true };
});


exports.useTicket = onCall(CALL_OPTS, async (request) => {
  const uid  = requireAuth(request);
  const { type, count } = request.data;
  if (!["normal","rare"].includes(type)) throw new HttpsError("invalid-argument","Invalid type");
  const n = Math.max(1, parseInt(count)||1);
  const p = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");

  if (type === "normal") {
    const avail = p.tickets||0;
    if (avail < 1) throw new HttpsError("failed-precondition","チケットがありません");
    const use  = Math.min(n, avail);
    const gain = use;
    await dbPatch(`players/${uid}`, {
      tickets: avail-use,
      coins:   r((p.coins||0)+gain),
    });
    await pushMeta(uid, {...p, tickets:avail-use, coins:r((p.coins||0)+gain)});
    return { gain, used: use };
  } else {
    const avail = p.rareTickets||0;
    if (avail < 1) throw new HttpsError("failed-precondition","レアチケットがありません");
    const use = Math.min(n, avail);
    let gain = 0;
    for (let i=0; i<use; i++) gain += Math.floor(Math.random()*10)+1;
    await dbPatch(`players/${uid}`, {
      rareTickets: avail-use,
      coins:       r((p.coins||0)+gain),
    });
    await pushMeta(uid, {...p, rareTickets:avail-use, coins:r((p.coins||0)+gain)});
    return { gain, used: use };
  }
});

// ============================================================
//  預金
// ============================================================
exports.deposit = onCall(CALL_OPTS, async (request) => {
  const uid    = requireAuth(request);
  const { action, amount, days } = request.data;
  const p      = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  const now    = Date.now();
  const coins  = r(p.coins||0);
  const dRate  = depositRate(p);
  const tdRate = termDepositRate(p);

  if (action === "deposit") {
    if (amount <= 0 || amount > coins)
      throw new HttpsError("invalid-argument","金額が不正です");
    const upd = { coins: coins-amount, deposit: { principal:amount, since:now }, depositBalance:amount };
    await dbPatch(`players/${uid}`, upd);
    await pushMeta(uid, {...p,...upd});
    return { balance: amount };
  }

  if (action === "add") {
    if (!p.deposit) throw new HttpsError("failed-precondition","預金がありません");
    if (amount <= 0 || amount > coins)
      throw new HttpsError("invalid-argument","金額が不正です");
    const curBal = r(p.deposit.principal * Math.pow(dRate,(now-p.deposit.since)/86400000));
    const np     = r(curBal + amount);
    const upd    = { coins:coins-amount, deposit:{principal:np,since:now}, depositBalance:np };
    await dbPatch(`players/${uid}`, upd);
    await pushMeta(uid, {...p,...upd});
    return { balance: np };
  }

  if (action === "withdraw") {
    if (!p.deposit) throw new HttpsError("failed-precondition","預金がありません");
    const bal = r(p.deposit.principal * Math.pow(dRate,(now-p.deposit.since)/86400000));
    const upd = { coins:coins+bal, deposit:null, depositBalance:0 };
    await dbPatch(`players/${uid}`, upd);
    await pushMeta(uid, {...p,...upd});
    return { returned: bal };
  }

  if (action === "term_deposit") {
    if (!days || days < 7) throw new HttpsError("invalid-argument","7日以上が必要です");
    if (amount <= 0 || amount > coins)
      throw new HttpsError("invalid-argument","金額が不正です");
    if ((p.termDeposit?.principal||0) > 0)
      throw new HttpsError("already-exists","既に定期預金があります");
    const upd = { coins:coins-amount, termDeposit:{principal:amount,since:now,days}, termDepositBalance:amount };
    await dbPatch(`players/${uid}`, upd);
    await pushMeta(uid, {...p,...upd});
    return { principal:amount, days };
  }

  if (action === "term_withdraw") {
    if (!p.termDeposit) throw new HttpsError("failed-precondition","定期預金がありません");
    const elapsed = (now-p.termDeposit.since)/86400000;
    const matured = elapsed >= p.termDeposit.days;
    const ret     = matured
      ? r(p.termDeposit.principal * Math.pow(tdRate, elapsed))
      : r(p.termDeposit.principal);
    const upd = { coins:coins+ret, termDeposit:null, termDepositBalance:0 };
    await dbPatch(`players/${uid}`, upd);
    await pushMeta(uid, {...p,...upd});
    return { returned:ret, matured };
  }

  throw new HttpsError("invalid-argument","Unknown action");
});

// ============================================================
//  ルーレット ベット
// ============================================================
exports.rouletteBet = onCall(CALL_OPTS, async (request) => {
  const uid   = requireAuth(request);
  const { bets, total } = request.data;
  if (!bets || total <= 0) throw new HttpsError("invalid-argument","ベットデータが不正です");

  // サーバー側でベット合計を再計算（改ざん防止）
  const serverTotal = Object.values(bets).reduce((a,b)=>a+r(b),0);
  if (serverTotal !== r(total)) throw new HttpsError("invalid-argument","ベット合計が一致しません");

  const p = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  if (serverTotal > r(p.coins||0)) throw new HttpsError("failed-precondition","COINが不足しています");

  // 賭け上限チェック
  const allTotal = await totalAssetsAll();
  const meta     = await dbGet("playersMeta") || {};
  const count    = Object.keys(meta).length;
  const myRt     = rankTotal(p);
  const limit    = calcBetLimitLocal(myRt, allTotal, count);
  const usage    = r((p.rouletteBet||0)+(p.investedCost||0));
  if (usage+serverTotal > limit)
    throw new HttpsError("failed-precondition",`賭け上限を超えています（残枠: ${limit-usage} COIN）`);

  // 既存ベットにマージ
  const rd = await dbGet("roulette") || { next:Date.now()+3600000, bets:{} };
  const ex = rd.bets?.[uid];
  let nb, na;
  if (ex) {
    nb = {...ex.bets};
    for (const [k,v] of Object.entries(bets)) nb[k] = r((nb[k]||0)+r(v));
    na = r((ex.amount||0)+serverTotal);
  } else {
    nb = {...bets}; na = serverTotal;
  }
  await db.ref(`roulette/bets/${uid}`).set({ playerId:uid, bets:nb, amount:na });
  const upd = { coins:r((p.coins||0)-serverTotal), rouletteBet:r((p.rouletteBet||0)+serverTotal) };
  await dbPatch(`players/${uid}`, upd);
  await pushMeta(uid, {...p,...upd});
  return { ok:true };
});

// ============================================================
//  ルーレット 開催（スケジュール実行 + 手動実行）
// ============================================================
async function processRouletteInternal() {
  const rd = await dbGet("roulette");
  if (!rd || Date.now() < rd.next) return { skipped:true };
  if (rd.processing) return { skipped:true, reason:"already_processing" };

  // ロック取得
  await dbPatch("roulette", { processing:true });
  try {
    const result = WHEEL_ORDER[Math.floor(Math.random()*38)];
    const bets   = rd.bets || {};
    const results = {};

    // 全プレイヤーの精算
    for (const [uid, bet] of Object.entries(bets)) {
      const p = await dbGet(`players/${uid}`);
      if (!p) continue;
      let win = 0;
      for (const [t,a] of Object.entries(bet.bets||{})) win += calcWin(t,result,a);
      win = r(win);
      const upd = {
        coins:       r((p.coins||0)+win),
        rouletteBet: Math.max(0, r((p.rouletteBet||0)-r(bet.amount))),
      };
      await dbPatch(`players/${uid}`, upd);
      await db.ref(`roulette/bets/${uid}`).remove();
      await pushMeta(uid, {...p,...upd});
      results[uid] = { result, win };
    }
    await dbPatch("roulette", { next:Date.now()+3600000, last:result, processing:false });
    return { result, results };
  } catch(e) {
    await dbPatch("roulette", { processing:false });
    throw e;
  }
}

// 手動トリガー（クライアントからの呼び出し）
exports.processRoulette = onCall(CALL_OPTS, async (request) => {
  requireAuth(request);
  return processRouletteInternal();
});

// 自動スケジュール（毎時0分）
exports.scheduledRoulette = onSchedule("0 * * * *", async () => {
  await processRouletteInternal();
});

// ============================================================
//  投資 売買
// ============================================================
exports.invest = onCall(CALL_OPTS, async (request) => {
  const uid             = requireAuth(request);
  const { action, symbol, qty } = request.data;
  const p      = await dbGet(`players/${uid}`);
  const stocks = await dbGet("stocks");
  if (!p || !stocks) throw new HttpsError("not-found","データ取得失敗");

  if (action === "buy") {
    const s = stocks[symbol];
    if (!s) throw new HttpsError("not-found","銘柄が見つかりません");
    const cost = r(s.price * qty);
    if (cost > r(p.coins||0)) throw new HttpsError("failed-precondition","COINが不足しています");
    // 賭け上限チェック
    const allTotal = await totalAssetsAll();
    const meta     = await dbGet("playersMeta") || {};
    const limit    = calcBetLimitLocal(rankTotal(p), allTotal, Object.keys(meta).length);
    const usage    = r((p.rouletteBet||0)+(p.investedCost||0));
    if (usage+cost > limit)
      throw new HttpsError("failed-precondition","賭け上限を超えています");
    const holdings = {...(p.holdings||{})};
    holdings[symbol] = r((holdings[symbol]||0)+qty);
    const upd = { coins:r((p.coins||0)-cost), holdings, investedCost:r((p.investedCost||0)+cost) };
    await dbPatch(`players/${uid}`, upd);
    await pushMeta(uid, {...p,...upd});
    return { cost };
  }

  if (action === "sell") {
    const s = stocks[symbol];
    if (!s) throw new HttpsError("not-found","銘柄が見つかりません");
    if ((p.holdings?.[symbol]||0) < qty)
      throw new HttpsError("failed-precondition","保有数が不足しています");
    const rev       = r(s.price * qty);
    const totalHeld = Object.values(p.holdings||{}).reduce((a,b)=>a+b,0);
    const avgCost   = totalHeld > 0 ? (p.investedCost||0)/totalHeld : 0;
    const holdings  = {...(p.holdings||{})};
    holdings[symbol] = r((holdings[symbol]||0)-qty);
    const upd = {
      coins:        r((p.coins||0)+rev),
      holdings,
      investedCost: Math.max(0,r((p.investedCost||0)-r(avgCost*qty))),
    };
    await dbPatch(`players/${uid}`, upd);
    await pushMeta(uid, {...p,...upd});
    return { revenue: rev };
  }

  throw new HttpsError("invalid-argument","Unknown action");
});

// ============================================================
//  株価更新（スケジュール：12時間ごと）
// ============================================================
async function updateStockPricesInternal() {
  const stocks   = await dbGet("stocks") || {};
  const meta     = await dbGet("playersMeta") || {};
  const allTotal = Math.max(1, Object.values(meta).reduce((s,m)=>s+(m.rankTotal||0),0));
  const updated  = {};

  for (const [sym, s] of Object.entries(stocks)) {
    if (Date.now() < (s.nextUpdate||0)) continue;
    const cur = s.price || 1;
    // 交渉者バフ: 保有数を2倍として計算
    const totalHeld = Object.entries(meta).reduce((sum,[,m]) => {
      const held = m.holdings?.[sym]||0;
      return sum + (m.trait==="negotiator" ? held*2 : held);
    }, 0);
    let raw;
    if (totalHeld === 0) {
      raw = 1 + (Math.random()-0.5)*0.02;
    } else {
      const ratio = (cur*totalHeld)/allTotal;
      raw = (1+ratio*0.04) * (1+(Math.random()-0.5)*0.02);
    }
    const actual   = Math.random()<0.4 ? 1/raw : raw;
    const newPrice = Math.max(1, r(cur*actual));
    const history  = [...(s.history||[cur]), newPrice].slice(-60);
    await dbPatch(`stocks/${sym}`, { price:newPrice, history, nextUpdate:Date.now()+43200000 });
    updated[sym]   = { old:cur, new:newPrice };
  }
  return updated;
}

exports.updateStockPrices = onCall(CALL_OPTS, async (request) => {
  requireAuth(request);
  return { updated: await updateStockPricesInternal() };
});

exports.scheduledStockUpdate = onSchedule("0 */12 * * *", async () => {
  await updateStockPricesInternal();
});

// ============================================================
//  チケット自動付与（スケジュール：1分ごと）
// ============================================================
exports.scheduledTickets = onSchedule("* * * * *", async () => {
  const meta = await dbGet("playersMeta") || {};
  const avg  = Object.values(meta).length
    ? Object.values(meta).reduce((s,m)=>s+(m.rankTotal||0),0)/Object.values(meta).length : 0;

  const players = await dbGet("players") || {};
  for (const [uid, p] of Object.entries(players)) {
    const now      = Date.now();
    const interval = ticketInterval(p, avg);
    const elapsed  = now-(p.lastTicketTime||now);
    const newT     = Math.floor(elapsed/interval);
    if (newT <= 0) continue;
    const avail = Math.max(0,100-(p.tickets||0)-(p.rareTickets||0));
    const add   = Math.min(newT, avail);
    if (add <= 0) {
      await dbPatch(`players/${uid}`, { lastTicketTime:(p.lastTicketTime||now)+newT*interval });
      continue;
    }
    let nn=0, nr=0;
    const prob = rareProb(p, avg);
    for (let i=0; i<add; i++) Math.random()<prob ? nr++ : nn++;
    await dbPatch(`players/${uid}`, {
      tickets:        (p.tickets||0)+nn,
      rareTickets:    (p.rareTickets||0)+nr,
      lastTicketTime: (p.lastTicketTime||now)+newT*interval,
    });
  }
});

// ============================================================
//  デイリーボーナス（スケジュール：毎日0時）
// ============================================================
exports.scheduledDailyBonus = onSchedule("0 0 * * *", async () => {
  const meta   = await dbGet("playersMeta") || {};
  const avg    = Object.values(meta).length
    ? Object.values(meta).reduce((s,m)=>s+(m.rankTotal||0),0)/Object.values(meta).length : 0;
  const rows   = Object.entries(meta)
    .map(([uid,m])=>({uid,rt:m.rankTotal||0,trait:m.trait}))
    .sort((a,b)=>b.rt-a.rt);
  const first  = rows[0]?.rt || 0;

  for (const row of rows) {
    const p = await dbGet(`players/${row.uid}`);
    if (!p) continue;
    const myRt = rankTotal(p);

    // 逆転ボーナス（平均以下）
    if (myRt < avg) {
      const bonus = Math.max(1, r((avg-myRt)*0.05));
      await dbPatch(`players/${row.uid}`, {
        coins:          r((p.coins||0)+bonus),
        lastDailyBonus: Date.now(),
      });
    }

    // 1位補正ボーナス（修正済み計算式）
    if (myRt < first && first > 0) {
      const base  = Math.floor(((first/(myRt+1)-1)/100+1)*myRt);
      let   bonus = base - myRt;
      if (bonus > 0) {
        // 経営者バフ: 2倍
        if (p.trait === "manager") bonus *= 2;
        const pp = await dbGet(`players/${row.uid}`);
        await dbPatch(`players/${row.uid}`, {
          coins:          r((pp.coins||0)+bonus),
          lastFirstBonus: Date.now(),
        });
      }
    }

    await pushMeta(row.uid, await dbGet(`players/${row.uid}`));
  }
});

// ============================================================
//  会社株価更新・配当（スケジュール：12時間ごと / 週次）
// ============================================================
exports.scheduledCompanyUpdate = onSchedule("30 */12 * * *", async () => {
  const companies = await dbGet("companies") || {};
  const meta      = await dbGet("playersMeta") || {};

  for (const [id, c] of Object.entries(companies)) {
    if (Date.now() >= (c.nextUpdate||0)) {
      const cur     = c.price || 1;
      const circ    = Math.max(1, c.circulatingShares||1);
      const capital = c.capital || cur;
      const base    = capital / circ;
      const noise   = 1 + (Math.random()-0.5)*0.04;
      let   newPriceRaw = base * noise;
      const desired = Object.values(c.desiredPrices||{});
      if (desired.length > 0) {
        const avgDesired = desired.reduce((a,b)=>a+b,0)/desired.length;
        newPriceRaw = (newPriceRaw+avgDesired)/2;
      }
      const newPrice = Math.max(1, r(newPriceRaw));
      const history  = [...(c.history||[cur]), newPrice].slice(-60);
      await dbPatch(`companies/${id}`, {
        price:newPrice, history,
        nextUpdate:    Date.now()+43200000,
        desiredPrices: {},
      });
    }

    // 配当（週次）
    if (Date.now() >= (c.nextDividend||0)) {
      const shareholders = c.shareholders || {};
      let totalDiv = 0;
      const price  = (await dbGet(`companies/${id}/price`)) || c.price || 1;
      for (const [shUid, qty] of Object.entries(shareholders)) {
        if (qty <= 0) continue;
        const divAmt = Math.max(1, r(price*qty*0.01));
        const sp     = await dbGet(`players/${shUid}`);
        if (sp) { await dbPatch(`players/${shUid}`,{coins:r((sp.coins||0)+divAmt)}); }
        totalDiv += divAmt;
      }
      // 配当分を経営者から徴収
      const ownerUids = Object.keys(c.owners||{});
      const perOwner  = ownerUids.length > 0 ? r(totalDiv/ownerUids.length) : 0;
      for (const ownerUid of ownerUids) {
        const op = await dbGet(`players/${ownerUid}`);
        if (op) {
          await dbPatch(`players/${ownerUid}`,{coins:Math.max(0,r((op.coins||0)-perOwner))});
        }
      }
      // 売却ボーナス配布
      const bonusPerOwner = ownerUids.length > 0
        ? r((c.pendingBonus||0)/ownerUids.length) : 0;
      for (const ownerUid of ownerUids) {
        if (bonusPerOwner <= 0) break;
        const op = await dbGet(`players/${ownerUid}`);
        if (op) { await dbPatch(`players/${ownerUid}`,{coins:r((op.coins||0)+bonusPerOwner)}); }
      }
      await dbPatch(`companies/${id}`, {
        nextDividend:      Date.now()+7*86400000,
        totalDividendPaid: r((c.totalDividendPaid||0)+totalDiv),
        pendingBonus:      0,
      });
    }
  }
});

// ============================================================
//  特性変更
// ============================================================
exports.changeTrait = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const p   = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  if ((p.coins||0) < 2000)
    throw new HttpsError("failed-precondition","2000 COINが必要です");
  const current  = p.trait;
  let newTrait;
  do { newTrait = TRAITS[Math.floor(Math.random()*TRAITS.length)]; }
  while (newTrait === current);
  const upd = { coins:r((p.coins||0)-2000), trait:newTrait };
  await dbPatch(`players/${uid}`, upd);
  await pushMeta(uid, {...p,...upd});
  return { newTrait };
});

// ============================================================
//  会社 起業
// ============================================================
exports.foundCompany = onCall(CALL_OPTS, async (request) => {
  const uid              = requireAuth(request);
  const { name, price, shares } = request.data;
  if (!name || price<1 || shares<1)
    throw new HttpsError("invalid-argument","入力値が不正です");
  const cost = r(price * shares);
  const p    = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  if (cost > r(p.coins||0)) throw new HttpsError("failed-precondition","COINが不足しています");
  const now  = Date.now();
  const id   = `co_${now}_${Math.random().toString(36).slice(2,7)}`;
  const comp = {
    id, name,
    ownerId:           uid,
    ownerName:         p.name||"",
    initialPrice:      price,
    totalShares:       shares,
    circulatingShares: shares,
    price,
    history:           [price],
    nextUpdate:        now+43200000,
    capital:           cost,
    owners:            { [uid]: { name:p.name||"", capital:cost, trait:p.trait||null } },
    shareholders:      {},
    desiredPrices:     {},
    invites:           {},
    totalDividendPaid: 0,
    nextDividend:      now+7*86400000,
    pendingBonus:      0,
    createdAt:         now,
  };
  await dbSet(`companies/${id}`, comp);
  await dbPatch(`players/${uid}`, { coins:r((p.coins||0)-cost) });
  await pushMeta(uid, {...p, coins:r((p.coins||0)-cost)});
  return { id, name, cost };
});

// ============================================================
//  会社株 購入
// ============================================================
exports.buyCompanyStock = onCall(CALL_OPTS, async (request) => {
  const uid             = requireAuth(request);
  const { companyId, qty } = request.data;
  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if ((c.circulatingShares||0) < qty)
    throw new HttpsError("failed-precondition","流通株数が不足しています");
  const p    = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  const cost = r(c.price * qty);
  if (cost > r(p.coins||0)) throw new HttpsError("failed-precondition","COINが不足しています");
  const meta      = await dbGet("playersMeta") || {};
  const bonusRate = hasAllTraits(c.owners, meta) ? 2 : 1;
  const newShares = r((c.shareholders?.[uid]||0)+qty);
  await dbPatch(`companies/${companyId}`, {
    circulatingShares:     (c.circulatingShares||0)-qty,
    pendingBonus:          r((c.pendingBonus||0)+bonusRate*qty),
    [`shareholders/${uid}`]: newShares,
  });
  const holdings = {...(p.holdings||{})};
  holdings[`co_${companyId}`] = newShares;
  const upd = { coins:r((p.coins||0)-cost), holdings, investedCost:r((p.investedCost||0)+cost) };
  await dbPatch(`players/${uid}`, upd);
  await pushMeta(uid, {...p,...upd});
  return { cost };
});

// ============================================================
//  会社株 売却
// ============================================================
exports.sellCompanyStock = onCall(CALL_OPTS, async (request) => {
  const uid             = requireAuth(request);
  const { companyId, qty } = request.data;
  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  const p = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  if ((c.shareholders?.[uid]||0) < qty)
    throw new HttpsError("failed-precondition","保有数が不足しています");
  const rev       = r(c.price*qty);
  const totalHeld = Object.values(p.holdings||{}).reduce((a,b)=>a+b,0);
  const avgCost   = totalHeld>0 ? (p.investedCost||0)/totalHeld : 0;
  const newShares = (c.shareholders?.[uid]||0)-qty;
  await dbPatch(`companies/${companyId}`, {
    circulatingShares:       (c.circulatingShares||0)+qty,
    [`shareholders/${uid}`]: newShares,
  });
  const holdings  = {...(p.holdings||{})};
  holdings[`co_${companyId}`] = newShares;
  const upd = {
    coins:        r((p.coins||0)+rev),
    holdings,
    investedCost: Math.max(0,r((p.investedCost||0)-r(avgCost*qty))),
  };
  await dbPatch(`players/${uid}`, upd);
  await pushMeta(uid, {...p,...upd});
  return { revenue: rev };
});

// ============================================================
//  希望株価設定
// ============================================================
exports.setDesiredPrice = onCall(CALL_OPTS, async (request) => {
  const uid               = requireAuth(request);
  const { companyId, desiredPrice } = request.data;
  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (!Object.keys(c.owners||{}).includes(uid))
    throw new HttpsError("permission-denied","経営者ではありません");
  const min = r(c.price*0.5), max = r(c.price*2);
  if (desiredPrice < min || desiredPrice > max)
    throw new HttpsError("invalid-argument",`${min}〜${max} COINの範囲で設定してください`);
  await dbPatch(`companies/${companyId}/desiredPrices`, { [uid]: desiredPrice });
  return { ok:true };
});

// ============================================================
//  共同経営者招待・承認・拒否
// ============================================================
exports.inviteCoOwner = onCall(CALL_OPTS, async (request) => {
  const uid                    = requireAuth(request);
  const { companyId, targetName } = request.data;
  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (c.ownerId !== uid) throw new HttpsError("permission-denied","招待できるのは創業者のみです");
  const meta  = await dbGet("playersMeta") || {};
  const entry = Object.entries(meta).find(([,m])=>m.name===targetName);
  if (!entry) throw new HttpsError("not-found","プレイヤーが見つかりません");
  const [targetUid, targetMeta] = entry;
  if (targetUid === uid) throw new HttpsError("invalid-argument","自分自身は招待できません");
  if (Object.keys(c.owners||{}).includes(targetUid))
    throw new HttpsError("already-exists","既に経営者です");
  await dbPatch(`companies/${companyId}/invites`, {
    [targetUid]: { name:targetMeta.name||"???", status:"pending", sentAt:Date.now() }
  });
  return { ok:true };
});

exports.acceptInvite = onCall(CALL_OPTS, async (request) => {
  const uid         = requireAuth(request);
  const { companyId } = request.data;
  const p = await dbGet(`players/${uid}`);
  const c = await dbGet(`companies/${companyId}`);
  if (!p || !c) throw new HttpsError("not-found","データが見つかりません");
  await dbPatch(`companies/${companyId}/owners`, {
    [uid]: { name:p.name||"", capital:0, trait:p.trait||null }
  });
  await dbPatch(`companies/${companyId}/invites/${uid}`, { status:"accepted" });
  return { ok:true };
});

exports.rejectInvite = onCall(CALL_OPTS, async (request) => {
  const uid         = requireAuth(request);
  const { companyId } = request.data;
  await dbPatch(`companies/${companyId}/invites/${uid}`, { status:"rejected" });
  return { ok:true };
});

// ============================================================
//  会社解散
// ============================================================
exports.dissolveCompany = onCall(CALL_OPTS, async (request) => {
  const uid         = requireAuth(request);
  const { companyId } = request.data;
  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (c.ownerId !== uid) throw new HttpsError("permission-denied","解散できるのは創業者のみです");
  const ownerCount      = Object.keys(c.owners||{}).length;
  const returnPerOwner  = r((c.capital||0)/Math.max(1,ownerCount));
  for (const ownerUid of Object.keys(c.owners||{})) {
    const op = await dbGet(`players/${ownerUid}`);
    if (op) { await dbPatch(`players/${ownerUid}`,{coins:r((op.coins||0)+returnPerOwner)}); }
  }
  await db.ref(`companies/${companyId}`).remove();
  return { returned: returnPerOwner };
});
