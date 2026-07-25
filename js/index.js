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

// onCall関数の共通オプション（全オリジン許可・IDトークン検証で安全性担保）
const CALL_OPTS = {
  cors: true,
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
const fmt  = n => Math.round(n).toLocaleString("ja-JP");
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

// ランキング用スコア（会社出資額を含む）
function rankTotal(p) {
  return r((p.coins||0) + (p.deposit?.principal||0) + (p.termDeposit?.principal||0)
          + (p.rouletteBet||0) + (p.investedCost||0) + (p.companyInvested||0));
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

// チケット間隔
// 逆転ボーナスはチケット速度に影響しない（特性のみ）
// 仕事人: 通常の1.5倍速（間隔を2/3に短縮）
// その他: 60秒固定
function ticketInterval(p) {
  const base = 60000;
  return p.trait === "worker" ? r(base * (2/3)) : base;
}

// レアチケット確率
// 逆転ボーナスはレア確率に影響しない（特性のみ）
// バランサー: 通常の確率+10%（10%+10%=20%）
// その他: 10%固定
function rareProb(p) {
  return p.trait === "balancer" ? 0.20 : 0.10;
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

  // roulette: なければ作成、processing stuck なら解除
  const rd = await dbGet("roulette");
  if (!rd) {
    await dbSet("roulette", {
      next: Date.now()+3600000, bets:{}, last:null,
      processing:false, processingSince:null
    });
  } else if (rd.processing) {
    // 5分以上processingのままなら解除
    const stuckSince = rd.processingSince || 0;
    if (Date.now() - stuckSince > 5*60*1000) {
      await dbPatch("roulette", { processing:false, processingSince:null });
    }
  }

  // stocks: なければ作成、あれば recentBuyVolume/recentSellVolume フィールドを追加
  const stocks = await dbGet("stocks");
  if (!stocks) {
    await dbSet("stocks", {
      ALPHA:{ name:"Alpha Corp", price:100, history:[100], nextUpdate:0, recentBuyVolume:0, recentSellVolume:0 },
      BETA: { name:"Beta Inc",   price:80,  history:[80],  nextUpdate:0, recentBuyVolume:0, recentSellVolume:0 },
      GAMMA:{ name:"Gamma Ltd",  price:50,  history:[50],  nextUpdate:0, recentBuyVolume:0, recentSellVolume:0 },
    });
  } else {
    // 既存stocksにrecentBuyVolume/recentSellVolumeが未設定なら追加
    for (const sym of ["ALPHA","BETA","GAMMA"]) {
      if (stocks[sym] && stocks[sym].recentBuyVolume === undefined) {
        await dbPatch(`stocks/${sym}`, { recentBuyVolume:0, recentSellVolume:0 });
      }
    }
  }

  if (!await dbGet("companies")) {
    await dbSet("companies", {});
  }
  return { ok:true };
});


exports.registerPlayer = onCall(CALL_OPTS, async (request) => {
  const uid  = requireAuth(request);
  const { name, realName } = request.data;
  if (!name || !name.trim()) throw new HttpsError("invalid-argument","プレイヤー名が必要です");
  if (!realName || !realName.trim()) throw new HttpsError("invalid-argument","本名が必要です");

  const existing = await dbGet(`players/${uid}`);
  if (existing) throw new HttpsError("already-exists","既に登録済みです");

  const now   = Date.now();
  const trait = TRAITS[Math.floor(Math.random()*TRAITS.length)];
  const np    = {
    id: uid, name: name.trim(),
    realName: realName.trim(), // 本名（運営者のみ確認可能）
    coins: 0, tickets: 0, rareTickets: 0,
    lastTicketTime: now,
    deposit: null, depositBalance: 0,
    termDeposit: null, termDepositBalance: 0,
    rouletteBet: 0, holdings: {}, investedCost: 0,
    companyInvested: 0,
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
    // 翌日反映制度: 引き出しリクエストを pending として保存
    const now2 = Date.now();
    const todayMid = new Date(now2);
    todayMid.setHours(0,0,0,0);
    const tomorrowMid = todayMid.getTime() + 86400000;
    await dbPatch(`players/${uid}`, {
      "deposit/pendingWithdrawal": true,
      "deposit/withdrawalScheduled": tomorrowMid,
    });
    await pushMeta(uid, {...p, deposit:{...p.deposit, pendingWithdrawal:true}});
    return { scheduled: tomorrowMid, message:"翌日0時に引き出し処理されます" };
  }

  if (action === "cancel_withdraw") {
    // 引き出しキャンセル
    await dbPatch(`players/${uid}`, {
      "deposit/pendingWithdrawal": false,
      "deposit/withdrawalScheduled": null,
    });
    return { ok:true };
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

    if (matured) {
      // 満期の場合は即時返還
      const upd = { coins: coins+ret, termDeposit: null, termDepositBalance: 0 };
      await dbPatch(`players/${uid}`, upd);
      await pushMeta(uid, {...p, ...upd});
      return { returned: ret, matured: true, immediate: true };
    } else {
      // 期限前解約は翌日反映
      const todayMidTd    = new Date(now); todayMidTd.setHours(0,0,0,0);
      const tomorrowMidTd = todayMidTd.getTime() + 86400000;
      await dbPatch(`players/${uid}`, {
        "termDeposit/pendingWithdrawal":   true,
        "termDeposit/withdrawalScheduled": tomorrowMidTd,
        "termDeposit/withdrawalAmount":    ret,
      });
      return { scheduled: tomorrowMidTd, returned: ret, matured: false };
    }
  }

  if (action === "cancel_term_withdraw") {
    if (!p.termDeposit) throw new HttpsError("failed-precondition","定期預金がありません");
    await dbPatch(`players/${uid}`, {
      "termDeposit/pendingWithdrawal":   false,
      "termDeposit/withdrawalScheduled": null,
      "termDeposit/withdrawalAmount":    null,
    });
    return { ok:true };
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
  if (!rd) return { skipped:true };
  const now = Date.now();
  if (now < rd.next) return { skipped:true };

  // processingがtrueの場合、30秒以上経過していればデッドロックとみなして解除
  if (rd.processing) {
    const stuckSince = rd.processingSince || 0;
    if (now - stuckSince < 30 * 1000) {
      return { skipped:true, reason:"already_processing" };
    }
    await dbPatch("roulette", { processing:false, processingSince:null });
  }

  // ロック取得
  await dbPatch("roulette", { processing:true, processingSince:now });
  try {
    const result  = WHEEL_ORDER[Math.floor(Math.random()*38)];
    // betsをDBから直接取得（rdのスナップショットではなく最新値を使用）
    const bets    = (await dbGet("roulette/bets")) || {};
    const results    = {};
    const winResults = {};

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
      winResults[uid] = win;
      results[uid]    = { result, win };
    }
    await dbPatch("roulette", {
      next:            now + 3600000,
      last:            result,
      lastUpdatedAt:   now,
      winResults,
      processing:      false,
      processingSince: null,
    });
    return { result, results };
  } catch(e) {
    await dbPatch("roulette", { processing:false, processingSince:null });
    throw e;
  }
}

// 手動トリガー（クライアントからの呼び出し）
exports.processRoulette = onCall(CALL_OPTS, async (request) => {
  requireAuth(request);
  return processRouletteInternal();
});

// 自動スケジュール（毎分チェック：nextを過ぎたら即実行）
exports.scheduledRoulette = onSchedule("* * * * *", async () => {
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
    // 株価計算用に売買ボリュームを記録（交渉者バフ: 購入額を2倍計上）
    const buyVol = p.trait === "negotiator" ? cost*2 : cost;
    const curBuyVol = (await dbGet(`stocks/${symbol}/recentBuyVolume`)) || 0;
    await dbPatch(`stocks/${symbol}`, { recentBuyVolume: r(curBuyVol + buyVol) });
    return { cost };
  }

  if (action === "sell") {
    const s = stocks[symbol];
    if (!s) throw new HttpsError("not-found","銘柄が見つかりません");
    if ((p.holdings?.[symbol]||0) < qty)
      throw new HttpsError("failed-precondition","保有数が不足しています");
    const rev     = r(s.price * qty);
    // ★ investedCostからは「売却株数 × 1株あたりの取得原価」を差し引く
    // 売却時の市場価格ではなく購入時のコストを使うことで利益・損失が混入しない
    const totalHeld  = Object.values(p.holdings||{}).reduce((a,b)=>a+b, 0);
    const costPerUnit= totalHeld > 0 ? (p.investedCost||0) / totalHeld : 0;
    const costReduced= r(costPerUnit * qty);
    const holdings   = {...(p.holdings||{})};
    holdings[symbol] = r((holdings[symbol]||0) - qty);
    const upd = {
      coins:        r((p.coins||0)+rev),
      holdings,
      investedCost: Math.max(0, r((p.investedCost||0) - costReduced)),
    };
    await dbPatch(`players/${uid}`, upd);
    await pushMeta(uid, {...p,...upd});
    // 売却ボリュームを記録
    const curSellVol = (await dbGet(`stocks/${symbol}/recentSellVolume`)) || 0;
    await dbPatch(`stocks/${symbol}`, { recentSellVolume: r(curSellVol + rev) });
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

    // 直前の変動からの新規購入額合計・売却額合計を取得
    // 交渉者バフ: 購入額を2倍として計算
    const recentBuy  = s.recentBuyVolume  || 0;
    const recentSell = s.recentSellVolume || 0;

    // 新計算式:
    // 新株価 = 直前株価 × (全体資産 + 購入額 - 売却額) / 全体資産
    const newPriceRaw = cur * (allTotal + recentBuy - recentSell) / allTotal;
    const newPrice    = Math.max(1, r(newPriceRaw));
    const history     = [...(s.history||[cur]), newPrice].slice(-60);

    await dbPatch(`stocks/${sym}`, {
      price:            newPrice,
      history,
      nextUpdate:       Date.now()+43200000,
      recentBuyVolume:  0,
      recentSellVolume: 0,
    });
    updated[sym] = { old:cur, new:newPrice };
  }
  return updated;
}

exports.updateStockPrices = onCall(CALL_OPTS, async (request) => {
  requireAuth(request);
  return { updated: await updateStockPricesInternal() };
});

// 自動スケジュール（毎分チェック：nextUpdateを過ぎたら即実行）
exports.scheduledStockUpdate = onSchedule("* * * * *", async () => {
  await updateStockPricesInternal();
});

// ============================================================
//  チケット自動付与（スケジュール：1分ごと）
// ============================================================
exports.scheduledTickets = onSchedule("* * * * *", async () => {
  const players = await dbGet("players") || {};
  for (const [uid, p] of Object.entries(players)) {
    const now      = Date.now();
    const interval = ticketInterval(p); // avg不要
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
    const prob = rareProb(p); // avg不要
    for (let i=0; i<add; i++) Math.random()<prob ? nr++ : nn++;
    await dbPatch(`players/${uid}`, {
      tickets:        (p.tickets||0)+nn,
      rareTickets:    (p.rareTickets||0)+nr,
      lastTicketTime: (p.lastTicketTime||now)+newT*interval,
    });
  }
});

// ============================================================
//  デイリーボーナス + 預金翌日反映処理（毎日0時）
// ============================================================
exports.scheduledDailyBonus = onSchedule("0 0 * * *", async () => {
  const meta   = await dbGet("playersMeta") || {};
  const avg    = Object.values(meta).length
    ? Object.values(meta).reduce((s,m)=>s+(m.rankTotal||0),0)/Object.values(meta).length : 0;
  const rows   = Object.entries(meta)
    .map(([uid,m])=>({uid,rt:m.rankTotal||0,trait:m.trait}))
    .sort((a,b)=>b.rt-a.rt);
  const first  = rows[0]?.rt || 0;
  const now    = Date.now();

  for (const row of rows) {
    const p = await dbGet(`players/${row.uid}`);
    if (!p) continue;
    const myRt   = rankTotal(p);
    const dRate  = depositRate(p);
    const tdRate = termDepositRate(p);

    // ── 普通預金の翌日引き出し処理 ──
    if (p.deposit?.pendingWithdrawal && now >= (p.deposit.withdrawalScheduled||0)) {
      const bal = r(p.deposit.principal * Math.pow(dRate, (now-p.deposit.since)/86400000));
      await dbPatch(`players/${row.uid}`, {
        coins:          r((p.coins||0)+bal),
        deposit:        null,
        depositBalance: 0,
      });
      await pushMeta(row.uid, {...p, coins:r((p.coins||0)+bal), deposit:null, depositBalance:0});
    }

    // ── 定期預金の翌日引き出し処理 ──
    if (p.termDeposit?.pendingWithdrawal && now >= (p.termDeposit.withdrawalScheduled||0)) {
      const elapsed = (now - p.termDeposit.since) / 86400000;
      const matured = elapsed >= p.termDeposit.days;
      const ret     = matured
        ? r(p.termDeposit.principal * Math.pow(tdRate, elapsed))
        : r(p.termDeposit.principal);
      const pp = await dbGet(`players/${row.uid}`);
      await dbPatch(`players/${row.uid}`, {
        coins:              r((pp.coins||0)+ret),
        termDeposit:        null,
        termDepositBalance: 0,
      });
      await pushMeta(row.uid, {...pp, coins:r((pp.coins||0)+ret), termDeposit:null});
    }

    // ── 逆転ボーナス（平均以下）──
    const freshP = await dbGet(`players/${row.uid}`);
    if (!freshP) continue;
    const freshRt = rankTotal(freshP);
    if (freshRt < avg) {
      const bonus = Math.max(1, r((avg-freshRt)*0.05));
      await dbPatch(`players/${row.uid}`, {
        coins:          r((freshP.coins||0)+bonus),
        lastDailyBonus: now,
      });
    }

    // ── 1位補正ボーナス ──
    if (freshRt < first && first > 0) {
      const base  = Math.floor(((first/(freshRt+1)-1)/100+1)*freshRt);
      let   bonus = base - freshRt;
      if (bonus > 0) {
        if (freshP.trait === "manager") bonus *= 2;
        const pp2 = await dbGet(`players/${row.uid}`);
        await dbPatch(`players/${row.uid}`, {
          coins:          r((pp2.coins||0)+bonus),
          lastFirstBonus: now,
        });
      }
    }

    await pushMeta(row.uid, await dbGet(`players/${row.uid}`));
  }
});

// ============================================================
//  会社株価更新・配当（毎分チェック・予算制度対応版）
// ============================================================
exports.scheduledCompanyUpdate = onSchedule("* * * * *", async () => {
  const companies = await dbGet("companies") || {};
  const now       = Date.now();

  for (const [id, c] of Object.entries(companies)) {

    // ── 株価更新（12時間ごと）──
    if (now >= (c.nextUpdate||0)) {
      const cur  = c.price || 1;
      const circ = Math.max(1, c.circulatingShares||1);
      // 予算合計 / 流通株数 × ノイズ
      const budget    = c.totalBudget || (c.capital||cur);
      const base      = budget / circ;
      const noise     = 1 + (Math.random()-0.5)*0.04;
      const newPrice  = Math.max(1, r(base * noise));
      const history   = [...(c.history||[cur]), newPrice].slice(-60);
      await dbPatch(`companies/${id}`, {
        price:     newPrice,
        history,
        nextUpdate: now + 43200000,
      });
    }

    // ── 配当（週次）──
    if (now >= (c.nextDividend||0)) {
      const shareholders = c.shareholders || {};
      const price = (await dbGet(`companies/${id}/price`)) || c.price || 1;
      let totalDiv = 0;

      // 株主へ配当支払い（株価×保有数×1%）
      for (const [shUid, qty] of Object.entries(shareholders)) {
        if (qty <= 0) continue;
        const divAmt = Math.max(1, r(price * qty * 0.01));
        const sp     = await dbGet(`players/${shUid}`);
        if (sp) await dbPatch(`players/${shUid}`, { coins: r((sp.coins||0)+divAmt) });
        totalDiv += divAmt;
      }

      // 配当を会社予算から差し引き
      const budgetAfterDiv = r((c.totalBudget||0) - totalDiv);
      await dbPatch(`companies/${id}`, { totalBudget: budgetAfterDiv });

      // ── 予算の利益を経営者に分配（起業者は2倍）──
      // 予算がプラスの場合のみ利益分配
      // 損益（マイナス）は積立比率で均等負担
      const budget       = c.budget || {};
      const founderUid   = c.ownerId;
      // 退職していない経営者のみ対象
      const activeOwners = Object.entries(budget).filter(([,b]) => !b.resigned);
      if (activeOwners.length > 0) {
        const totalDeposited = activeOwners.reduce((s,[,b])=>s+(b.deposited||0), 0);
        // 起業者は2票、他は1票として重み付け
        const totalWeight = activeOwners.reduce((s,[uid2,])=>
          s + (uid2===founderUid ? 2 : 1), 0);

        // 週次の純利益 = 今週の株価変動分 × 流通株数（簡易計算）
        // 実際には予算残高の変化で判定
        // 今週の予算変化 = 配当支払い後の予算 - 前回の予算
        // ここでは簡易的に株価上昇分を利益として計算
        const prevPrice = (c.history||[price]).slice(-2)[0] || price;
        const priceGain = Math.max(0, r((price - prevPrice) * (c.totalShares - (c.circulatingShares||0))));

        if (priceGain > 0) {
          for (const [ownerUid,] of activeOwners) {
            const weight  = ownerUid===founderUid ? 2 : 1;
            const share   = r(priceGain * weight / totalWeight);
            if (share <= 0) continue;
            const op = await dbGet(`players/${ownerUid}`);
            if (op) await dbPatch(`players/${ownerUid}`, { coins: r((op.coins||0)+share) });
          }
        }
      }

      await dbPatch(`companies/${id}`, {
        nextDividend:      now + 7*86400000,
        totalDividendPaid: r((c.totalDividendPaid||0)+totalDiv),
      });
    }
  }
});

// ============================================================
//  特性変更（指定した特性に変更）
// ============================================================
exports.changeTrait = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const { newTrait } = request.data;
  const VALID = ["worker","manager","negotiator","balancer","accountant"];
  if (!VALID.includes(newTrait))
    throw new HttpsError("invalid-argument","無効な特性です");
  const p = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  if ((p.coins||0) < 2000)
    throw new HttpsError("failed-precondition","2000 COINが必要です");
  if (p.trait === newTrait)
    throw new HttpsError("invalid-argument","既にその特性です");
  const upd = { coins:r((p.coins||0)-2000), trait:newTrait };
  await dbPatch(`players/${uid}`, upd);
  await pushMeta(uid, {...p,...upd});
  return { newTrait };
});

// ============================================================
//  会社 起業（会社予算制度対応版）
// ============================================================
exports.foundCompany = onCall(CALL_OPTS, async (request) => {
  const uid              = requireAuth(request);
  const { name, price, shares } = request.data;
  if (!name || price<1 || shares<1)
    throw new HttpsError("invalid-argument","入力値が不正です");
  const cost = r(price * shares);
  const p    = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  // 起業時は借金禁止（残高不足なら弾く）
  if (cost > r(p.coins||0))
    throw new HttpsError("failed-precondition",
      `起業には ${fmt(cost)} COINが必要です（現在: ${fmt(r(p.coins||0))} COIN）`);
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
    // 会社予算: { uid: { deposited: N } } 形式で各経営者の積立額を管理
    budget:            { [uid]: { deposited: cost, name: p.name||"" } },
    totalBudget:       cost,
    owners:            { [uid]: { name:p.name||"", trait:p.trait||null } },
    shareholders:      {},
    invites:           {},
    totalDividendPaid: 0,
    nextDividend:      now+7*86400000,
    createdAt:         now,
  };
  await dbSet(`companies/${id}`, comp);
  // 借金許可: coinsがマイナスになってもそのまま保存
  const newCoins = r((p.coins||0)-cost);
  await dbPatch(`players/${uid}`, {
    coins:           newCoins,
    companyInvested: r((p.companyInvested||0)+cost),
  });
  await pushMeta(uid, {...p, coins:newCoins, companyInvested:r((p.companyInvested||0)+cost)});
  return { id, name, cost };
});

// ============================================================
//  会社予算への入金（経営者のみ）
// ============================================================
exports.depositToBudget = onCall(CALL_OPTS, async (request) => {
  const uid             = requireAuth(request);
  const { companyId, amount } = request.data;
  if (!amount || amount <= 0) throw new HttpsError("invalid-argument","金額が不正です");
  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (!Object.keys(c.owners||{}).includes(uid))
    throw new HttpsError("permission-denied","経営者ではありません");
  const p = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  const newCoins    = r((p.coins||0)-amount);
  const prevDeposit = c.budget?.[uid]?.deposited || 0;
  const newDeposit  = r(prevDeposit + amount);
  const newTotal    = r((c.totalBudget||0) + amount);
  await dbPatch(`companies/${companyId}`, {
    [`budget/${uid}/deposited`]: newDeposit,
    [`budget/${uid}/name`]:      p.name||"",
    totalBudget:                 newTotal,
  });
  await dbPatch(`players/${uid}`, {
    coins:           newCoins,
    companyInvested: r((p.companyInvested||0)+amount),
  });
  await pushMeta(uid, {...p, coins:newCoins, companyInvested:r((p.companyInvested||0)+amount)});
  return { ok:true, newTotal };
});

// ============================================================
//  会社退職（起業者以外のみ可能）
// ============================================================
exports.resignFromCompany = onCall(CALL_OPTS, async (request) => {
  const uid           = requireAuth(request);
  const { companyId } = request.data;
  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (c.ownerId === uid)
    throw new HttpsError("permission-denied","起業者は退職できません。解散を使用してください");
  if (!Object.keys(c.owners||{}).includes(uid))
    throw new HttpsError("failed-precondition","この会社の経営者ではありません");
  await db.ref(`companies/${companyId}/owners/${uid}`).remove();
  await dbPatch(`companies/${companyId}/budget/${uid}`, { resigned: true });
  return { ok:true };
});

// ============================================================
//  会社株 購入（贈呈COIN廃止・全特性揃い時は生産速度バフのみ）
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
  const newShares = r((c.shareholders?.[uid]||0)+qty);
  // 贈呈COIN廃止
  await dbPatch(`companies/${companyId}`, {
    circulatingShares:       (c.circulatingShares||0)-qty,
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
  if (!c.invites?.[uid] || c.invites[uid].status !== "pending")
    throw new HttpsError("failed-precondition","招待が見つかりません");
  // owners に追加
  await dbPatch(`companies/${companyId}/owners`, {
    [uid]: { name:p.name||"", trait:p.trait||null }
  });
  // budget に初期エントリを作成（積立額0でスタート）
  await dbPatch(`companies/${companyId}/budget`, {
    [uid]: { deposited:0, name:p.name||"", resigned:false }
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
//  会社解散（予算制度対応版）
//  ・株主への補填は会社予算から支出（借金許可でマイナスになる場合あり）
//  ・残った予算は各経営者の積立比率に応じて分配
//  ・赤字（予算マイナス）の場合は積立比率に応じて負担
//  ・退職済み経営者は分配対象外
// ============================================================
exports.dissolveCompany = onCall(CALL_OPTS, async (request) => {
  const uid         = requireAuth(request);
  const { companyId } = request.data;
  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (c.ownerId !== uid)
    throw new HttpsError("permission-denied","解散できるのは創業者のみです");

  const shareholders = c.shareholders || {};
  let   totalRefund  = 0;

  // 1. 株主への補填（購入コストを予算から支出）
  for (const [shUid, qty] of Object.entries(shareholders)) {
    if (qty <= 0) continue;
    const sp = await dbGet(`players/${shUid}`);
    if (!sp) continue;
    const totalHeld = Object.values(sp.holdings||{}).reduce((a,b)=>a+b, 0);
    const avgCost   = totalHeld > 0 ? (sp.investedCost||0)/totalHeld : (c.price||1);
    const refund    = r(avgCost * qty);
    totalRefund    += refund;
    const holdings  = {...(sp.holdings||{})};
    delete holdings[`co_${companyId}`];
    await dbPatch(`players/${shUid}`, {
      coins:        r((sp.coins||0) + refund),
      holdings,
      investedCost: Math.max(0, r((sp.investedCost||0) - refund)),
    });
  }

  // 2. 残予算 = 現在の予算 - 株主補填額（借金許可でマイナスOK）
  const remainBudget = r((c.totalBudget||0) - totalRefund);

  // 3. 各経営者の積立額を集計（退職者除く）
  const budget       = c.budget || {};
  const activeOwners = Object.entries(budget).filter(([,b]) => !b.resigned);
  const totalDeposited = activeOwners.reduce((s,[,b])=>s+(b.deposited||0), 0);

  // 4. 残予算を積立比率で分配（赤字の場合は逆比率で負担）
  for (const [ownerUid, budgetData] of activeOwners) {
    const deposited = budgetData.deposited || 0;
    const ratio     = totalDeposited > 0 ? deposited / totalDeposited : 1 / activeOwners.length;
    const share     = r(remainBudget * ratio);
    const op        = await dbGet(`players/${ownerUid}`);
    if (!op) continue;
    await dbPatch(`players/${ownerUid}`, {
      coins:           r((op.coins||0) + share),
      // ★ companyInvestedをリセット（この会社への出資分のみ差し引く）
      companyInvested: Math.max(0, r((op.companyInvested||0) - deposited)),
    });
    await pushMeta(ownerUid, {...op,
      coins:           r((op.coins||0) + share),
      companyInvested: Math.max(0, r((op.companyInvested||0) - deposited)),
    });
  }

  await db.ref(`companies/${companyId}`).remove();
  return { totalRefund, remainBudget };
});

// ============================================================
//  生産システム
//  ・経営者が手動で生産トリガーを押す
//  ・通常: 60分/回、全特性揃い会社: 15分/回
//  ・生産コストは会社予算から引かれる
//  ・生産量 = 経営者の人数（退職者除く）
// ============================================================

// ============================================================
//  生産アイテム定義
// ============================================================
const PRODUCT_TYPES = {
  term_ticket:  { name:"定期預金即引出チケット",    cost:100,   desc:"利息込みで定期預金を即時引き出せる（1枚1回限り）" },
  roulette_tip: { name:"ルーレット当選番号速報",    cost:20000, desc:"10%の確率で次回ルーレットの当選番号が事前にわかる" },
  trade_viewer: { name:"株売買履歴閲覧装置",        cost:100,   desc:"全プレイヤーの株売買履歴を24時間閲覧できる" },
  trait_ticket: { name:"特性変更チケット",          cost:100,   desc:"指定した特性に24時間変更できる" },
};
const TRAIT_LABELS = { worker:"仕事人", manager:"経営者", negotiator:"交渉者", balancer:"バランサー", accountant:"会計士" };

// 生産
exports.produce = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const { companyId, productType, traitTarget } = request.data;

  if (!PRODUCT_TYPES[productType])
    throw new HttpsError("invalid-argument","無効な商品種類です");
  if (productType === "trait_ticket" && !TRAITS.includes(traitTarget))
    throw new HttpsError("invalid-argument","有効な特性を指定してください");

  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (!Object.keys(c.owners||{}).includes(uid))
    throw new HttpsError("permission-denied","経営者ではありません");

  const now        = Date.now();
  const meta       = await dbGet("playersMeta") || {};
  const allTraits  = hasAllTraits(c.owners, meta);
  const intervalMs = allTraits ? 90*60*1000 : 120*60*1000;
  if (now - (c.lastProducedAt||0) < intervalMs) {
    const remaining = Math.ceil((intervalMs - (now-(c.lastProducedAt||0)))/60000);
    throw new HttpsError("failed-precondition",`次の生産まで ${remaining} 分かかります`);
  }

  const activeOwners = Object.entries(c.budget||{}).filter(([,b])=>!b.resigned);
  const qty          = Math.max(1, activeOwners.length);
  const unitCost     = PRODUCT_TYPES[productType].cost;
  const totalCost    = qty * unitCost;
  const newBudget    = r((c.totalBudget||0) - totalCost);

  // 在庫キー: trait_ticketは対象特性ごとに分ける
  const stockKey   = productType === "trait_ticket" ? `trait_ticket_${traitTarget}` : productType;
  const currentQty = (await dbGet(`companies/${companyId}/stock/${stockKey}`)) || 0;
  await dbSet(`companies/${companyId}/stock/${stockKey}`, currentQty + qty);
  await dbPatch(`companies/${companyId}`, { totalBudget: newBudget, lastProducedAt: now });

  // ルーレット速報: 事前に当たるか決定してDBに保存
  if (productType === "roulette_tip") {
    const isHit     = Math.random() < 0.10;
    const winNumber = isHit ? WHEEL_ORDER[Math.floor(Math.random()*38)] : null;
    await dbSet(`companies/${companyId}/rouletteTipResult`, { isHit, winNumber, generatedAt: now });
  }

  const displayName = productType === "trait_ticket"
    ? `特性変更チケット（${TRAIT_LABELS[traitTarget]}）` : PRODUCT_TYPES[productType].name;
  return { qty, totalCost, newStock: currentQty + qty, productName: displayName, allTraits };
});

// ============================================================
//  販売所システム
//  ・生産した商品を市場に出品
//  ・他のプレイヤーが購入可能
//  ・売上は会社予算に入る
// ============================================================

exports.listProduct = onCall(CALL_OPTS, async (request) => {
  const uid                                        = requireAuth(request);
  const { companyId, stockKey, qty, pricePerUnit } = request.data;
  if (!stockKey)          throw new HttpsError("invalid-argument","商品種類を指定してください");
  if (!qty || qty <= 0)   throw new HttpsError("invalid-argument","数量が不正です");
  if (!pricePerUnit || pricePerUnit <= 0)
    throw new HttpsError("invalid-argument","価格が不正です");

  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (!Object.keys(c.owners||{}).includes(uid))
    throw new HttpsError("permission-denied","経営者ではありません");

  const currentStock = (await dbGet(`companies/${companyId}/stock/${stockKey}`)) || 0;
  if (currentStock < qty)
    throw new HttpsError("failed-precondition",
      `在庫が不足しています（在庫: ${currentStock}個）`);

  const now       = Date.now();
  const listingId = `lst_${now}_${Math.random().toString(36).slice(2,6)}`;
  const displayName = (() => {
    if (stockKey==="term_ticket")  return "定期預金即引出チケット";
    if (stockKey==="roulette_tip") return "ルーレット当選番号速報";
    if (stockKey==="trade_viewer") return "株売買履歴閲覧装置";
    const m = stockKey.match(/^trait_ticket_(.+)$/);
    const tl = { worker:"仕事人", manager:"経営者", negotiator:"交渉者",
                 balancer:"バランサー", accountant:"会計士" };
    if (m) return `特性変更チケット（${tl[m[1]]||m[1]}）`;
    return stockKey;
  })();
  const listing = {
    id: listingId, companyId,
    companyName: c.name,
    stockKey,
    productName: displayName,
    qty, pricePerUnit,
    createdAt:  now,
    sellerId:   uid,
  };

  await dbSet(`companies/${companyId}/stock/${stockKey}`, currentStock - qty);
  await dbSet(`market/${listingId}`, listing);
  await dbSet(`companies/${companyId}/listings/${listingId}`, {
    qty, pricePerUnit, listingId, stockKey, createdAt: now,
  });
  return { listingId };
});

exports.delistProduct = onCall(CALL_OPTS, async (request) => {
  const uid           = requireAuth(request);
  const { listingId } = request.data;
  const listing = await dbGet(`market/${listingId}`);
  if (!listing) throw new HttpsError("not-found","出品が見つかりません");
  const c = await dbGet(`companies/${listing.companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (!Object.keys(c.owners||{}).includes(uid))
    throw new HttpsError("permission-denied","経営者ではありません");
  // 在庫に戻す（stockKey対応）
  const key = listing.stockKey || "term_ticket";
  const cur = (await dbGet(`companies/${listing.companyId}/stock/${key}`)) || 0;
  await dbSet(`companies/${listing.companyId}/stock/${key}`, cur + listing.qty);
  await db.ref(`market/${listingId}`).remove();
  await db.ref(`companies/${listing.companyId}/listings/${listingId}`).remove();
  return { ok:true };
});

exports.buyProduct = onCall(CALL_OPTS, async (request) => {
  const uid                = requireAuth(request);
  const { listingId, qty } = request.data;
  if (!qty || qty <= 0) throw new HttpsError("invalid-argument","数量が不正です");

  const listing = await dbGet(`market/${listingId}`);
  if (!listing) throw new HttpsError("not-found","出品が見つかりません");
  if (listing.qty < qty)
    throw new HttpsError("failed-precondition",
      `数量が不足しています（残り: ${listing.qty}個）`);

  const p = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");
  const totalCost = r(listing.pricePerUnit * qty);
  if (totalCost > r(p.coins||0))
    throw new HttpsError("failed-precondition","COINが不足しています");

  // 購入者の残高を減らす
  await dbPatch(`players/${uid}`, { coins: r((p.coins||0) - totalCost) });
  await pushMeta(uid, {...p, coins: r((p.coins||0) - totalCost)});

  // 購入者のアイテムにstockKeyで保存
  const itemKey    = listing.stockKey || "term_ticket";
  const curItems   = (await dbGet(`players/${uid}/items/${itemKey}`)) || 0;
  await dbSet(`players/${uid}/items/${itemKey}`, curItems + qty);

  // 売上を会社予算に追加
  const c = await dbGet(`companies/${listing.companyId}`);
  if (c) {
    await dbPatch(`companies/${listing.companyId}`, {
      totalBudget: r((c.totalBudget||0) + totalCost),
    });
  }

  // 出品数を更新
  const newQty = listing.qty - qty;
  if (newQty <= 0) {
    await db.ref(`market/${listingId}`).remove();
    await db.ref(`companies/${listing.companyId}/listings/${listingId}`).remove();
  } else {
    await dbPatch(`market/${listingId}`, { qty: newQty });
    await dbPatch(`companies/${listing.companyId}/listings/${listingId}`, { qty: newQty });
  }

  return { totalCost, remaining: newQty };
});

// ============================================================
//  既存ユーザーへの本名登録
// ============================================================
exports.updateRealName = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const { realName } = request.data;
  if (!realName?.trim()) throw new HttpsError("invalid-argument","本名を入力してください");
  await dbPatch(`players/${uid}`, { realName: realName.trim() });
  return { ok:true };
});

// ============================================================
//  アイテム使用
// ============================================================

// ① 定期預金即引出チケット（利息込み即時引き出し）
exports.useTermTicket = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const p   = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");

  const itemCount = (await dbGet(`players/${uid}/items/term_ticket`)) || 0;
  if (itemCount < 1)
    throw new HttpsError("failed-precondition","定期預金即引出チケットがありません");
  if (!p.termDeposit?.principal)
    throw new HttpsError("failed-precondition","定期預金がありません");

  const now     = Date.now();
  const tdRate  = termDepositRate(p);
  const elapsed = (now - p.termDeposit.since) / 86400000;
  // チケット使用時は利息込みで全額返還
  const ret     = r(p.termDeposit.principal * Math.pow(tdRate, elapsed));

  await dbPatch(`players/${uid}`, {
    coins:              r((p.coins||0) + ret),
    termDeposit:        null,
    termDepositBalance: 0,
  });
  // チケットを1枚消費
  await dbSet(`players/${uid}/items/term_ticket`, itemCount - 1);
  await pushMeta(uid, {...p, coins: r((p.coins||0)+ret), termDeposit: null});
  return { returned: ret, interest: r(ret - p.termDeposit.principal) };
});

// ② ルーレット当選番号速報（事前に決定済みの結果を取得）
exports.useRouletteTip = onCall(CALL_OPTS, async (request) => {
  const uid             = requireAuth(request);
  const { companyId }   = request.data; // 購入元会社のID
  const p = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");

  const itemCount = (await dbGet(`players/${uid}/items/roulette_tip`)) || 0;
  if (itemCount < 1)
    throw new HttpsError("failed-precondition","ルーレット当選番号速報がありません");

  // 購入元会社の事前決定結果を取得
  const tipResult = await dbGet(`companies/${companyId}/rouletteTipResult`);
  if (!tipResult)
    throw new HttpsError("not-found","速報データが見つかりません");

  // チケットを1枚消費
  await dbSet(`players/${uid}/items/roulette_tip`, itemCount - 1);

  if (!tipResult.isHit) {
    return { hit: false, message: "今回は外れです（次回ルーレットは当選番号情報なし）" };
  }
  return { hit: true, winNumber: tipResult.winNumber,
           message: `次回ルーレットの当選番号は ${tipResult.winNumber} です！` };
});

// ③ 株売買履歴閲覧装置（24時間有効フラグを付与）
exports.useTradeViewer = onCall(CALL_OPTS, async (request) => {
  const uid = requireAuth(request);
  const p   = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");

  const itemCount = (await dbGet(`players/${uid}/items/trade_viewer`)) || 0;
  if (itemCount < 1)
    throw new HttpsError("failed-precondition","株売買履歴閲覧装置がありません");

  const now     = Date.now();
  const expires = now + 24*60*60*1000;
  await dbPatch(`players/${uid}`, { tradeViewerExpires: expires });
  await dbSet(`players/${uid}/items/trade_viewer`, itemCount - 1);
  return { expires, message: "株売買履歴を24時間閲覧できます" };
});

// ④ 特性変更チケット（24時間の一時特性変更）
exports.useTraitTicket = onCall(CALL_OPTS, async (request) => {
  const uid           = requireAuth(request);
  const { traitTarget } = request.data;
  if (!TRAITS.includes(traitTarget))
    throw new HttpsError("invalid-argument","無効な特性です");

  const p = await dbGet(`players/${uid}`);
  if (!p) throw new HttpsError("not-found","Player not found");

  const ticketKey = `trait_ticket_${traitTarget}`;
  const itemCount = (await dbGet(`players/${uid}/items/${ticketKey}`)) || 0;
  if (itemCount < 1)
    throw new HttpsError("failed-precondition",`${traitTarget}の特性変更チケットがありません`);

  const now     = Date.now();
  const expires = now + 24*60*60*1000;

  // 元の特性を保存して一時変更
  await dbPatch(`players/${uid}`, {
    originalTrait:       p.trait || null,
    trait:               traitTarget,
    traitTicketExpires:  expires,
  });
  await dbSet(`players/${uid}/items/${ticketKey}`, itemCount - 1);
  await pushMeta(uid, {...p, trait: traitTarget});

  const tl = { worker:"仕事人", manager:"経営者", negotiator:"交渉者",
               balancer:"バランサー", accountant:"会計士" };
  return { newTrait: traitTarget, expires,
           message: `特性を「${tl[traitTarget]}」に24時間変更しました` };
});

// ============================================================
//  特性チケットの期限切れ処理（毎分チェック）
// ============================================================
exports.scheduledTraitExpiry = onSchedule("* * * * *", async () => {
  const now     = Date.now();
  const players = await dbGet("players") || {};
  for (const [uid, p] of Object.entries(players)) {
    if (!p.traitTicketExpires) continue;
    if (now < p.traitTicketExpires) continue;
    // 期限切れ → 元の特性に戻す
    const restored = p.originalTrait || "worker";
    await dbPatch(`players/${uid}`, {
      trait:              restored,
      originalTrait:      null,
      traitTicketExpires: null,
    });
    await pushMeta(uid, {...p, trait: restored, originalTrait: null});
  }
});

// ============================================================
//  株の追加発行（起業者のみ）
//  ・追加株数分のコストを会社予算から引く
//  ・追加発行により流通株数と総発行株数が増える
//  ・株価は予算/流通株数で計算されるため、追加発行で株価が希薄化する
// ============================================================
exports.issueMoreShares = onCall(CALL_OPTS, async (request) => {
  const uid           = requireAuth(request);
  const { companyId, additionalShares } = request.data;

  if (!additionalShares || additionalShares < 1)
    throw new HttpsError("invalid-argument","追加発行株数は1以上を指定してください");

  const c = await dbGet(`companies/${companyId}`);
  if (!c) throw new HttpsError("not-found","会社が見つかりません");
  if (c.ownerId !== uid)
    throw new HttpsError("permission-denied","株の追加発行は起業者のみ可能です");

  const newTotalShares       = (c.totalShares||0) + additionalShares;
  const newCirculatingShares = (c.circulatingShares||0) + additionalShares;

  // 追加発行コスト = 現在の株価 × 追加株数（会社予算から引く）
  const issueCost  = r((c.price||1) * additionalShares);
  const newBudget  = r((c.totalBudget||0) - issueCost);

  // 新しい株価 = 予算 / 新流通株数
  const newPrice   = Math.max(1, r(newBudget / Math.max(1, newCirculatingShares)));
  const history    = [...(c.history||[c.price||1]), newPrice].slice(-60);

  await dbPatch(`companies/${companyId}`, {
    totalShares:       newTotalShares,
    circulatingShares: newCirculatingShares,
    totalBudget:       newBudget,
    price:             newPrice,
    history,
  });

  return {
    newTotalShares,
    newCirculatingShares,
    newPrice,
    issueCost,
  };
});

// ============================================================
//  月間ランキング用スナップショット（毎月1日0時に保存）
//  日本時間（UTC+9）の月初を基準にする
// ============================================================
exports.scheduledMonthlySnapshot = onSchedule("0 15 1 * *", async () => {
  // 毎月1日 UTC15:00 = 日本時間 0:00
  const players = await dbGet("players") || {};
  const now     = Date.now();
  // 月のキー: YYYY-MM形式（日本時間基準）
  const jstDate = new Date(now + 9*60*60*1000);
  const monthKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth()+1).padStart(2,'0')}`;

  const snapshot = {};
  for (const [uid, p] of Object.entries(players)) {
    snapshot[uid] = {
      name:      p.name || "",
      rankTotal: rankTotal(p),
      savedAt:   now,
    };
  }
  await dbSet(`monthlySnapshots/${monthKey}`, snapshot);
});

// 月間スナップショットを手動で取得・作成するAPI
exports.getMonthlyRanking = onCall(CALL_OPTS, async (request) => {
  requireAuth(request);
  const now     = Date.now();
  const jstDate = new Date(now + 9*60*60*1000);
  const monthKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth()+1).padStart(2,'0')}`;

  let snapshot = await dbGet(`monthlySnapshots/${monthKey}`);

  // 今月のスナップショットがまだない場合は現時点のデータを一時的に使用
  if (!snapshot) {
    const players = await dbGet("players") || {};
    snapshot = {};
    for (const [uid, p] of Object.entries(players)) {
      snapshot[uid] = { name: p.name||"", rankTotal: rankTotal(p), savedAt: now };
    }
  }

  // 現在の資産と差分を計算
  const meta    = await dbGet("playersMeta") || {};
  const results = Object.entries(snapshot).map(([uid, snap]) => {
    const current = meta[uid]?.rankTotal || snap.rankTotal;
    const gain    = current - snap.rankTotal;
    return { uid, name: snap.name, startRankTotal: snap.rankTotal, current, gain };
  }).sort((a,b) => b.gain - a.gain);

  return { monthKey, results };
});
