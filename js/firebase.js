// ============================================================
//  js/firebase.js  Firebase初期化・共通ユーティリティ
//  ※ PHPサーバーなしでFirebaseに直接書き込む構成
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
// ============================================================

export const app  = initializeApp(FIREBASE_CONFIG);
export const db   = getDatabase(app);
export const auth = getAuth(app);

// ---- DB ヘルパー ----
export const dbGet    = async p => { const s = await get(ref(db,p)); return s.exists()?s.val():null; };
export const dbSet    = (p,v)   => set(ref(db,p), v);
export const dbUpdate = (p,v)   => update(ref(db,p), v);

// ---- ユーティリティ ----
export const r   = n => Math.round(n);
export const fmt = n => Math.round(n).toLocaleString('ja-JP');
export const esc = s => String(s??'').replace(/[&<>"']/g, c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
    depBal:  p.deposit     ? r(p.deposit.principal     * Math.pow(1.01,(now-p.deposit.since)    /86400000)) : 0,
    tdepBal: p.termDeposit ? r(p.termDeposit.principal * Math.pow(1.02,(now-p.termDeposit.since)/86400000)) : 0,
  };
}

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
// プレイヤーが1人または自分が全資産を占める場合でも機能するよう修正
// 上限 = 自分の総資産の50%（他プレイヤーがいない場合）
//       他プレイヤーがいる場合は元の式を使用
export function calcBetLimit(p, playersMeta) {
  const my    = rankTotal(p);
  const all   = totalAssetsAll(playersMeta);
  const count = Object.keys(playersMeta).length;
  if (count <= 1) {
    // 自分1人の場合は総資産の50%を上限にする
    return Math.max(0, r(my * 0.5));
  }
  const others = all - my;
  if (others <= 0) return Math.max(0, r(my * 0.5));
  // 他プレイヤーの合計資産に対する自分の資産の比率で上限を調整
  // 自分の割合が低いほど上限が高くなる
  const myRatio = my / all; // 0〜1
  return Math.max(0, r(my * (1 - myRatio)));
}

export function currentBetUsage(p) {
  return r((p.rouletteBet||0)+(p.investedCost||0));
}

// ---- 逆転ボーナス ----
export function calcTicketInterval(p, playersMeta) {
  const avg = avgAsset(playersMeta);
  if (avg <= 0) return 60000;
  const ratio = Math.min(1, rankTotal(p)/avg);
  return r(30000 + ratio*30000);
}
export function calcRareProb(p, playersMeta) {
  const avg = avgAsset(playersMeta);
  if (avg <= 0) return 0.10;
  const ratio = Math.min(1, rankTotal(p)/avg);
  return 0.20 - ratio*0.10;
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
  watch('playersMeta',    'meta',     v => callbacks.onMeta(v||{}));
  watch('roulette',       'roulette', v => callbacks.onRoulette(v));
  watch('stocks',         'stocks',   v => callbacks.onStocks(v||{}));
  return unsubs;
}

// ---- Toast ----
export function toast(msg, ms=3500) {
  const d = document.createElement('div');
  d.className='toast'; d.textContent=msg;
  document.getElementById('toasts').appendChild(d);
  setTimeout(()=>d.remove(), ms);
}

// ============================================================
//  callApi: PHPサーバーなし・Firebase直接書き込み版
//  セキュリティはFirebase Security Rulesに依存
// ============================================================
export async function callApi(endpoint, body={}) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  // ---- ticket.php ----
  if (endpoint === 'ticket.php') {
    const p = await dbGet(`players/${uid}`);
    if (!p) throw new Error('Player not found');
    if (body.type === 'normal') {
      const n = Math.min(Math.max(1, body.count||1), p.tickets||0);
      if ((p.tickets||0) < 1) throw new Error('チケットがありません');
      await dbUpdate(`players/${uid}`, {
        tickets: (p.tickets||0) - n,
        coins:   r((p.coins||0) + n),
      });
      return { ok:true, gain:n, used:n };
    } else {
      const n = Math.min(Math.max(1, body.count||1), p.rareTickets||0);
      if ((p.rareTickets||0) < 1) throw new Error('レアチケットがありません');
      let gain = 0;
      for (let i=0; i<n; i++) gain += Math.floor(Math.random()*10)+1;
      await dbUpdate(`players/${uid}`, {
        rareTickets: (p.rareTickets||0) - n,
        coins:       r((p.coins||0) + gain),
      });
      return { ok:true, gain, used:n };
    }
  }

  // ---- deposit.php ----
  if (endpoint === 'deposit.php') {
    const p   = await dbGet(`players/${uid}`);
    if (!p) throw new Error('Player not found');
    const now   = Date.now();
    const coins = r(p.coins||0);
    const action = body.action;

    if (action === 'deposit') {
      if (body.amount > coins) throw new Error('COINが不足しています');
      await dbUpdate(`players/${uid}`, {
        coins: coins - body.amount,
        deposit: { principal: body.amount, since: now },
        depositBalance: body.amount,
      });
      return { ok:true, balance: body.amount };
    }
    if (action === 'add') {
      if (body.amount > coins) throw new Error('COINが不足しています');
      const curBal = r(p.deposit.principal * Math.pow(1.01,(now-p.deposit.since)/86400000));
      const np = r(curBal + body.amount);
      await dbUpdate(`players/${uid}`, {
        coins: coins - body.amount,
        deposit: { principal: np, since: now },
        depositBalance: np,
      });
      return { ok:true, balance: np };
    }
    if (action === 'withdraw') {
      const bal = r(p.deposit.principal * Math.pow(1.01,(now-p.deposit.since)/86400000));
      await dbUpdate(`players/${uid}`, { coins: coins+bal, deposit: null, depositBalance: 0 });
      return { ok:true, returned: bal };
    }
    if (action === 'term_deposit') {
      if (body.days < 7) throw new Error('7日以上を指定してください');
      if (body.amount > coins) throw new Error('COINが不足しています');
      if ((p.termDeposit?.principal||0) > 0) throw new Error('既に定期預金があります');
      await dbUpdate(`players/${uid}`, {
        coins: coins - body.amount,
        termDeposit: { principal: body.amount, since: now, days: body.days },
        termDepositBalance: body.amount,
      });
      return { ok:true, principal: body.amount, days: body.days };
    }
    if (action === 'term_withdraw') {
      const td = p.termDeposit;
      if (!td) throw new Error('定期預金がありません');
      const elapsed = (now - td.since) / 86400000;
      const matured = elapsed >= td.days;
      const ret = matured ? r(td.principal*Math.pow(1.02,elapsed)) : r(td.principal);
      await dbUpdate(`players/${uid}`, { coins: coins+ret, termDeposit: null, termDepositBalance: 0 });
      return { ok:true, returned: ret, matured };
    }
  }

  // ---- roulette.php ----
  if (endpoint === 'roulette.php') {
    const p = await dbGet(`players/${uid}`);
    if (!p) throw new Error('Player not found');

    if (body.action === 'bet') {
      const total = body.total;
      if (total > r(p.coins||0)) throw new Error('COINが不足しています');
      const rd = await dbGet('roulette') || { next: Date.now()+3600000, bets:{} };
      const ex = rd.bets?.[uid];
      let nb, na;
      if (ex) {
        nb = {...ex.bets};
        for (const [k,v] of Object.entries(body.bets)) nb[k] = r((nb[k]||0)+v);
        na = r((ex.amount||0)+total);
      } else { nb={...body.bets}; na=total; }
      await dbSet(`roulette/bets/${uid}`, { playerId:uid, bets:nb, amount:na });
      await dbUpdate(`players/${uid}`, {
        coins:       r((p.coins||0)-total),
        rouletteBet: r((p.rouletteBet||0)+total),
      });
      return { ok:true };
    }

    if (body.action === 'process') {
      const rd = await dbGet('roulette');
      if (!rd || Date.now() < rd.next) throw new Error('Not time yet');
      if (rd.processing) throw new Error('Already processing');
      await dbUpdate('roulette', { processing: true });
      const result = WHEEL_ORDER[Math.floor(Math.random()*38)];
      const _isRed = n => RED_NUMS.includes(n);
      const _isBlack = n => !_isRed(n) && n > 0;
      const win_calc = (type, res, amt) => {
        const a=r(amt), n=res;
        if (/^num_(-?\d+)$/.test(type)) return parseInt(type.slice(4))===n?a*36:0;
        if (type==='red')   return n>0&&_isRed(n)  ?a*2:0;
        if (type==='black') return n>0&&_isBlack(n)?a*2:0;
        if (type==='even')  return n>0&&n%2===0    ?a*2:0;
        if (type==='odd')   return n>0&&n%2!==0    ?a*2:0;
        if (type==='low')   return n>=1&&n<=18     ?a*2:0;
        if (type==='high')  return n>=19&&n<=36    ?a*2:0;
        if (type==='col1')  return n>0&&n%3===1    ?a*3:0;
        if (type==='col2')  return n>0&&n%3===2    ?a*3:0;
        if (type==='col3')  return n>0&&n%3===0    ?a*3:0;
        if (type==='doz1')  return n>=1&&n<=12     ?a*3:0;
        if (type==='doz2')  return n>=13&&n<=24    ?a*3:0;
        if (type==='doz3')  return n>=25&&n<=36    ?a*3:0;
        return 0;
      };
      const myBet = rd.bets?.[uid];
      let win = 0;
      if (myBet) {
        for (const [t,a] of Object.entries(myBet.bets||{})) win += win_calc(t, result, a);
        win = r(win);
        await dbUpdate(`players/${uid}`, {
          coins:       r((p.coins||0)+win),
          rouletteBet: Math.max(0, r((p.rouletteBet||0)-r(myBet.amount))),
        });
        await dbSet(`roulette/bets/${uid}`, null);
      }
      await dbUpdate('roulette', { next: Date.now()+3600000, last: result, processing: false });
      return { ok:true, result, win, had_bet: !!myBet };
    }
  }

  // ---- invest.php ----
  if (endpoint === 'invest.php') {
    const p      = await dbGet(`players/${uid}`);
    const stocks = await dbGet('stocks');
    if (!p || !stocks) throw new Error('データ取得失敗');

    if (body.action === 'buy') {
      const s    = stocks[body.symbol];
      if (!s) throw new Error('銘柄が見つかりません');
      const cost = r(s.price * body.qty);
      if (cost > r(p.coins||0)) throw new Error('COINが不足しています');
      const holdings = {...(p.holdings||{})};
      holdings[body.symbol] = r((holdings[body.symbol]||0) + body.qty);
      await dbUpdate(`players/${uid}`, {
        coins:        r((p.coins||0)-cost),
        holdings,
        investedCost: r((p.investedCost||0)+cost),
      });
      return { ok:true, cost };
    }

    if (body.action === 'sell') {
      const s = stocks[body.symbol];
      if (!s) throw new Error('銘柄が見つかりません');
      if ((p.holdings?.[body.symbol]||0) < body.qty) throw new Error('保有数が不足しています');
      const rev       = r(s.price * body.qty);
      const totalHeld = Object.values(p.holdings||{}).reduce((a,b)=>a+b, 0);
      const avgCost   = totalHeld > 0 ? (p.investedCost||0)/totalHeld : 0;
      const holdings  = {...(p.holdings||{})};
      holdings[body.symbol] = r((holdings[body.symbol]||0) - body.qty);
      await dbUpdate(`players/${uid}`, {
        coins:        r((p.coins||0)+rev),
        holdings,
        investedCost: Math.max(0, r((p.investedCost||0)-r(avgCost*body.qty))),
      });
      return { ok:true, revenue: rev };
    }

    if (body.action === 'update_price') {
      const meta     = await dbGet('playersMeta') || {};
      const allTotal = Math.max(1, Object.values(meta).reduce((s,m)=>s+(m.rankTotal||0), 0));
      const updated  = {};
      for (const [sym, s] of Object.entries(stocks)) {
        if (Date.now() < (s.nextUpdate||0)) continue;
        const cur        = s.price || 1;
        const totalHeld  = Object.values(meta).reduce((sum,m)=>sum+(m.holdings?.[sym]||0), 0);
        let raw;
        if (totalHeld === 0) {
          raw = 1 + (Math.random()-0.5)*0.02;
        } else {
          const ratio = (cur*totalHeld) / allTotal;
          raw = (1+ratio*0.04) * (1+(Math.random()-0.5)*0.02);
        }
        const actual   = Math.random()<0.4 ? 1/raw : raw;
        const newPrice = Math.max(1, r(cur*actual));
        const history  = [...(s.history||[cur]), newPrice].slice(-60);
        await dbUpdate(`stocks/${sym}`, { price: newPrice, history, nextUpdate: Date.now()+43200000 });
        updated[sym] = { old: cur, new: newPrice };
      }
      return { ok:true, updated };
    }
  }

  // ---- bonus.php ----
  if (endpoint === 'bonus.php') {
    const p = await dbGet(`players/${uid}`);
    if (!p) throw new Error('Player not found');
    const now  = Date.now();
    const meta = await dbGet('playersMeta') || {};
    const metas = Object.values(meta);
    const avg  = metas.length ? metas.reduce((s,m)=>s+(m.rankTotal||0),0)/metas.length : 0;
    const myTotal = rankTotal(p);

    if (body.action === 'ticket_check') {
      const ratio    = avg > 0 ? Math.min(1, myTotal/avg) : 1;
      const interval = r(30000 + ratio*30000);
      const rareProb = 0.20 - ratio*0.10;
      const elapsed  = now - (p.lastTicketTime||now);
      const newT     = Math.floor(elapsed/interval);
      if (newT <= 0) return { ok:true, added:0, rare:0 };
      const avail = Math.max(0, 100-(p.tickets||0)-(p.rareTickets||0));
      const add   = Math.min(newT, avail);
      let nn=0, nr=0;
      for (let i=0; i<add; i++) Math.random()<rareProb ? nr++ : nn++;
      await dbUpdate(`players/${uid}`, {
        tickets:        (p.tickets||0)+nn,
        rareTickets:    (p.rareTickets||0)+nr,
        lastTicketTime: (p.lastTicketTime||now)+newT*interval,
      });
      return { ok:true, added:nn, rare:nr };
    }

    if (body.action === 'daily_bonus') {
      const todayMid = new Date(); todayMid.setHours(0,0,0,0);
      if ((p.lastDailyBonus||0) >= todayMid.getTime())
        return { ok:true, bonus:0, reason:'already_received' };
      if (myTotal >= avg)
        return { ok:true, bonus:0, reason:'above_average' };
      const bonus = Math.max(1, r((avg-myTotal)*0.05));
      await dbUpdate(`players/${uid}`, {
        coins:          r((p.coins||0)+bonus),
        lastDailyBonus: todayMid.getTime(),
      });
      return { ok:true, bonus };
    }
  }

  throw new Error(`Unknown endpoint: ${endpoint}`);
}
