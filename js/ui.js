// ============================================================
//  js/ui.js  レンダリング管理・共通UI
// ============================================================
import { fmt, esc, r, calcInterest, rankTotal, calcBetLimit,
         currentBetUsage, avgAsset, calcTicketInterval, calcRareProb,
         totalAssetsAll, isRed, WHEEL_ORDER } from './firebase.js';
import { buildRoulette, getOtherBets } from './roulette.js';
import { buildInvest } from './invest.js';

// ---- アプリ状態 ----
export const S = {
  tab: 'home', uid: null, pname: '',
  players: {}, playersMeta: {}, roulette: null, stocks: {},
  rbets: {}, now: Date.now(), submitting: false,
};

let mainRendered = false, renderScheduled = false;

export function scheduleRender() {
  if (renderScheduled || S.submitting) return;
  renderScheduled = true;
  requestAnimationFrame(() => { renderScheduled = false; if (!S.submitting) doRender(); });
}

export function doRender() {
  if (!S.uid) return;
  const p = S.players[S.uid]; if (!p) return;
  buildShell(p); renderPanel(p);
}

function buildShell(p) {
  const TABS = [
    {id:'home',icon:'🏠',label:'ホーム'},{id:'deposit',icon:'🏦',label:'預金'},
    {id:'roulette',icon:'🎰',label:'ルーレット'},{id:'invest',icon:'📈',label:'投資'},
    {id:'ranking',icon:'🏆',label:'ランキング'},
  ];
  if (!mainRendered) {
    mainRendered = true;
    document.getElementById('app').innerHTML = `
      <div class="header">
        <span class="logo">🏛 架空市場</span><span class="spacer"></span>
        <span class="badge badge-dark" id="hdr-name"></span>
        <button class="btn" style="font-size:12px;padding:5px 10px" onclick="W.logout()">ログアウト</button>
      </div>
      <div class="tab-bar" id="tab-bar"></div>
      <div class="panel" id="main-panel"></div>`;
  }
  const hdr = document.getElementById('hdr-name'); if (hdr) hdr.textContent = p.name || S.pname || '';
  const tb  = document.getElementById('tab-bar');
  if (tb) tb.innerHTML = TABS.map(t =>
    `<button class="tab ${S.tab===t.id?'active':''}" onclick="W._setTab('${t.id}')">${t.icon} ${t.label}</button>`
  ).join('');
}

export function renderPanel(p) {
  const panel = document.getElementById('main-panel'); if (!panel) return;
  let html = '';
  if (S.tab==='home')     html = buildHome(p);
  if (S.tab==='deposit')  html = buildDeposit(p);
  if (S.tab==='roulette') html = buildRoulette(p, S);
  if (S.tab==='invest')   html = buildInvest(p, S);
  if (S.tab==='ranking')  html = buildRanking();
  panel.innerHTML = html;
}

export function resetMain() { mainRendered = false; }

// ---- withSubmit ----
export async function withSubmit(fn) {
  S.submitting = true;
  try { await fn(); }
  catch(e) { window._toast?.('エラー: ' + e.message); console.error(e); }
  finally {
    S.submitting = false;
    const p = S.players[S.uid];
    if (p) { buildShell(p); renderPanel(p); }
  }
}

// ---- 毎秒タイマー（数値のみ更新） ----
export function updateMetricsOnly() {
  if (!S.uid) return;
  S.now = Date.now();
  const p = S.players[S.uid]; if (!p) return;
  const interval = calcTicketInterval(p, S.playersMeta);
  const elapsed  = S.now - (p.lastTicketTime || S.now);
  const secLeft  = Math.ceil(Math.max(0, interval - elapsed % interval) / 1000);
  const totalT   = (p.tickets||0) + (p.rareTickets||0);
  const { depBal, tdepBal } = calcInterest(p);
  let invVal = 0;
  for (const [sym,qty] of Object.entries(p.holdings||{}))
    if (S.stocks[sym]) invVal += S.stocks[sym].price * (qty||0);
  const total = r((p.coins||0) + depBal + tdepBal + (p.rouletteBet||0) + r(invVal));
  const els = {
    'mv-hand':  fmt(r(p.coins||0)), 'mv-total': fmt(total),
    'mv-tick':  String(p.tickets||0), 'mv-rare': String(p.rareTickets||0),
    'mv-next':  `${totalT}/100枚 | 次回: ${secLeft}秒後`,
  };
  for (const [id,val] of Object.entries(els)) { const el=document.getElementById(id); if(el) el.textContent=val; }
  const pf = document.getElementById('tick-fill'); if (pf) pf.style.width = `${totalT}%`;
  if (S.roulette && S.tab==='roulette') {
    const tl = Math.max(0, S.roulette.next - S.now);
    const rt = document.getElementById('r-timer');
    if (rt) rt.textContent = tl<500?'🔴 開催中！':`${Math.floor(tl/60000)}分${Math.floor((tl%60000)/1000)}秒後`;
    const rf = document.getElementById('r-fill');
    if (rf) rf.style.width = `${Math.min(100,(1-tl/3600000)*100)}%`;
  }
}

// ---- ホーム ----
function buildHome(p) {
  const now=S.now,interval=calcTicketInterval(p,S.playersMeta);
  const elapsed=now-(p.lastTicketTime||now);
  const secLeft=Math.ceil(Math.max(0,interval-elapsed%interval)/1000);
  const totalT=(p.tickets||0)+(p.rareTickets||0);
  const{depBal,tdepBal}=calcInterest(p);
  let invVal=0;
  for(const[sym,qty] of Object.entries(p.holdings||{}))if(S.stocks[sym])invVal+=S.stocks[sym].price*(qty||0);
  invVal=r(invVal);
  const total=r((p.coins||0)+depBal+tdepBal+(p.rouletteBet||0)+invVal);
  const nt=p.tickets||0,nr=p.rareTickets||0;
  const limit=calcBetLimit(p,S.playersMeta),usage=currentBetUsage(p);
  const usagePct=limit>0?Math.min(100,r(usage/limit*100)):0;
  const limitColor=usagePct>=90?'#c0392b':usagePct>=70?'#e67e22':'#1d9e75';
  const avg=avgAsset(S.playersMeta),myTotal=rankTotal(p);
  const isUnderAvg=myTotal<avg,rareProb=r(calcRareProb(p,S.playersMeta)*100);
  const intervalSec=r(interval/1000);
  const nowDate=new Date(now),nextMid=new Date(nowDate.getFullYear(),nowDate.getMonth(),nowDate.getDate()+1,0,0,0);
  const sToMid=Math.floor((nextMid-nowDate)/1000),hToMid=Math.floor(sToMid/3600),mToMid=Math.floor((sToMid%3600)/60);
  return `
  <div class="metrics">
    <div class="metric"><div class="ml">手持ち</div><div class="mv din"><span id="mv-hand">${fmt(r(p.coins||0))}</span><span class="mu"> C</span></div></div>
    <div class="metric"><div class="ml">総資産(評価)</div><div class="mv din"><span id="mv-total">${fmt(total)}</span><span class="mu"> C</span></div></div>
    <div class="metric"><div class="ml">チケット</div><div class="mv din"><span id="mv-tick">${nt}</span><span class="mu">枚</span></div></div>
    <div class="metric"><div class="ml" style="color:#7a5c00">★ レア</div><div class="mv din" style="color:#7a5c00"><span id="mv-rare">${nr}</span><span class="mu">枚</span></div></div>
  </div>
  ${isUnderAvg?`<div class="bonus-indicator">
    <span style="font-size:20px">📈</span>
    <div><div style="font-weight:700;font-size:13px">逆転ボーナス発動中</div>
    <div class="hint">チケット付与: <strong>${intervalSec}秒</strong>/枚 | レアチケット確率: <strong>${rareProb}%</strong></div>
    <div class="hint">デイリーボーナスまで: <strong>${hToMid}時間${mToMid}分</strong></div></div>
  </div>`:''}
  <div class="card">
    <div class="row" style="margin-bottom:5px">
      <span style="font-weight:700;font-size:13px">賭け上限</span><span class="spacer"></span>
      <span style="font-size:12px">使用: <strong class="din">${fmt(usage)}</strong> / 上限: <strong class="din">${fmt(limit)}</strong> COIN</span>
    </div>
    <div class="limit-bar"><div class="limit-fill" style="width:${usagePct}%;background:${limitColor}"></div></div>
    <div class="hint" style="margin-top:4px">ルーレットベット + 投資コストの合計上限</div>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:7px">
      <span class="card-title" style="margin:0">チケット</span><span class="spacer"></span>
      <span class="hint" id="mv-next">${totalT}/100枚 | 次回: ${secLeft}秒後</span>
    </div>
    <div class="progress-bar" style="margin-bottom:12px"><div class="progress-fill" id="tick-fill" style="width:${totalT}%"></div></div>
    <div class="ticket-section">
      <div class="ticket-row"><span class="ticket-label">🎟 チケット（×1 COIN）</span><span class="badge badge-blue">${nt}枚</span></div>
      <div class="ticket-controls">
        <button class="btn btn-sm" onclick="W._qt('n',1)"    ${nt<1?'disabled':''}>1枚</button>
        <button class="btn btn-sm" onclick="W._qt('n',10)"   ${nt<10?'disabled':''}>10枚</button>
        <button class="btn btn-sm" onclick="W._qt('n',${nt})" ${nt<1?'disabled':''}>全部(${nt}枚)</button>
        <input class="input" id="conv-n" type="number" min="1" max="${nt}" value="1" style="width:65px" ${nt<1?'disabled':''}/>
        <button class="btn btn-primary" onclick="W.useTicket('normal')" ${nt<1?'disabled':''}>変換</button>
      </div>
    </div>
    <div class="ticket-section" style="margin-top:10px">
      <div class="ticket-row"><span class="ticket-label">★ レアチケット（×1〜10 COIN）</span><span class="badge badge-gold">${nr}枚</span></div>
      <div class="ticket-controls">
        <button class="btn btn-sm" onclick="W._qt('r',1)"    ${nr<1?'disabled':''}>1枚</button>
        <button class="btn btn-sm" onclick="W._qt('r',5)"    ${nr<5?'disabled':''}>5枚</button>
        <button class="btn btn-sm" onclick="W._qt('r',${nr})" ${nr<1?'disabled':''}>全部(${nr}枚)</button>
        <input class="input" id="conv-r" type="number" min="1" max="${nr}" value="1" style="width:65px" ${nr<1?'disabled':''}/>
        <button class="btn btn-gold" onclick="W.useTicket('rare')" ${nr<1?'disabled':''}>まとめて使用</button>
      </div>
    </div>
  </div>
  ${p.deposit?.principal>0?`<div class="card"><div class="row"><span class="hint-label">🏦 普通預金</span><span class="spacer"></span><span class="badge badge-blue din">${fmt(depBal)} COIN</span></div><div class="hint" style="margin-top:3px">元本 <span class="din">${fmt(r(p.deposit.principal))}</span> C | 利率 1%/日</div></div>`:''}
  ${p.termDeposit?.principal>0?`<div class="card"><div class="row"><span class="hint-label">🔒 定期預金</span><span class="spacer"></span><span class="badge badge-purple din">${fmt(tdepBal)} COIN</span></div><div class="hint" style="margin-top:3px">元本 <span class="din">${fmt(r(p.termDeposit.principal))}</span> C | 利率 2%/日 | ${p.termDeposit.days}日満期</div></div>`:''}
  ${(p.rouletteBet||0)>0?`<div class="card"><div class="row"><span class="hint-label">🎰 ルーレット待機中</span><span class="spacer"></span><span class="badge badge-red din">${fmt(r(p.rouletteBet))} COIN</span></div></div>`:''}
  ${invVal>0?`<div class="card"><div class="row"><span class="hint-label">📈 投資評価額</span><span class="spacer"></span><span class="badge badge-green din">${fmt(invVal)} COIN</span></div></div>`:''}`;
}

// ---- 預金 ----
function buildDeposit(p) {
  const{depBal,tdepBal}=calcInterest(p);
  const tdl=p.termDeposit?Math.max(0,p.termDeposit.days-(Date.now()-p.termDeposit.since)/86400000):0;
  return `
  <div class="card">
    <div class="card-title">普通預金 <span class="hint" style="font-weight:400">利率 1%/日（複利）</span></div>
    ${p.deposit?.principal>0?`
      <div class="row" style="margin-bottom:6px"><span class="hint-label">現在の残高</span><span class="spacer"></span><span class="badge badge-blue din">${fmt(depBal)} COIN</span></div>
      <div class="hint" style="margin-bottom:10px">元本 <span class="din">${fmt(r(p.deposit.principal))}</span> C</div>
      <div class="row">
        <input class="input" id="dep-add" type="number" min="1" placeholder="追加額" style="max-width:130px"/>
        <button class="btn btn-primary" onclick="W.addDeposit()">追加預金</button>
        <button class="btn btn-danger" onclick="W.withdrawDeposit()">全額引き出し (<span class="din">${fmt(depBal)}</span> C)</button>
      </div>`:`
      <div class="row">
        <input class="input" id="dep-in" type="number" min="1" placeholder="預金額" style="flex:1"/>
        <button class="btn btn-primary" onclick="W.doDeposit()">預ける</button>
      </div>
      <div class="hint" style="margin-top:6px">手持ち: <span class="din">${fmt(r(p.coins||0))}</span> COIN</div>`}
  </div>
  <div class="card">
    <div class="card-title">定期預金 <span class="hint" style="font-weight:400">利率 2%/日（複利）・7日以上</span></div>
    ${p.termDeposit?.principal>0?`
      <div class="row" style="margin-bottom:6px"><span class="hint-label">現在の残高</span><span class="spacer"></span><span class="badge badge-purple din">${fmt(tdepBal)} COIN</span></div>
      <div class="hint" style="margin-bottom:10px">元本 <span class="din">${fmt(r(p.termDeposit.principal))}</span> C | 満期まで ${tdl.toFixed(1)} 日 ${tdl<=0?'<strong style="color:#166534">✓ 満期済み</strong>':''}</div>
      <button class="btn ${tdl>0?'btn-danger':''}" onclick="W.withdrawTermDeposit()">
        ${tdl>0?`期限前解約（元本 <span class="din">${fmt(r(p.termDeposit.principal))}</span> C を返還）`:`満期引き出し (<span class="din">${fmt(tdepBal)}</span> C)`}
      </button>`:`
      <div class="row" style="gap:6px">
        <input class="input" id="tdep-in" type="number" min="1" placeholder="預金額" style="flex:2;min-width:90px"/>
        <input class="input" id="tdep-days" type="number" min="7" value="7" placeholder="日数" style="flex:1;max-width:80px"/>
        <button class="btn btn-primary" onclick="W.doTermDeposit()">定期預け</button>
      </div>
      <div class="hint" style="margin-top:6px">手持ち: <span class="din">${fmt(r(p.coins||0))}</span> COIN</div>`}
  </div>`;
}

// ---- ランキング ----
function buildRanking() {
  const rows=Object.entries(S.playersMeta)
    .map(([uid,m])=>({uid,name:m.name||'???',rt:m.rankTotal||0,d:m.detail||{}}))
    .sort((a,b)=>b.rt-a.rt);
  const medals=['🥇','🥈','🥉'];
  const avg=avgAsset(S.playersMeta);
  let html=`<div class="hint" style="margin-bottom:10px">全体平均: <span class="din">${fmt(r(avg))}</span> COIN | 平均以下は逆転ボーナス適用中</div>`;
  if(!rows.length)return html+'<p style="color:#888;text-align:center;padding:30px">まだプレイヤーがいません</p>';
  rows.forEach((row,i)=>{
    const isMe=row.uid===S.uid,d=row.d,isUnder=row.rt<avg;
    html+=`<div class="rank-row${isMe?' me':''}">
      <div class="rank-num">${medals[i]||(i+1)}</div>
      <div style="flex:1;min-width:0">
        <div class="row" style="margin-bottom:2px">
          <span style="font-weight:700">${esc(row.name)}</span>
          ${isMe?'<span class="badge badge-dark" style="font-size:10px">あなた</span>':''}
          ${isUnder?'<span class="badge badge-orange" style="font-size:10px">📈 逆転中</span>':''}
        </div>
        <div class="hint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          手元:<span class="din">${fmt(d.coins||0)}</span> 預金:<span class="din">${fmt(d.dep||0)}</span> 定期:<span class="din">${fmt(d.tdep||0)}</span> ルーレット:<span class="din">${fmt(d.rbet||0)}</span> 投資:<span class="din">${fmt(d.inv||0)}</span> C
        </div>
      </div>
      <div class="din" style="font-weight:700;font-size:17px;white-space:nowrap">${fmt(row.rt)} C</div>
    </div>`;
  });
  return html;
}
