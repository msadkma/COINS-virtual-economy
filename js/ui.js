// ============================================================
//  js/ui.js  レンダリング管理・共通UI
// ============================================================
import { fmt, esc, r, calcInterest, calcInterestWithTrait, rankTotal, calcBetLimit,
         currentBetUsage, avgAsset, calcTicketInterval, calcRareProb,
         totalAssetsAll, isRed, WHEEL_ORDER } from './firebase.js';
import { buildRoulette } from './roulette.js';
import { buildInvest }   from './invest.js';
import { buildRanking }  from './ranking.js';
import { buildCompany }  from './company.js';
import { buildRules }    from './rules.js';

// ---- アプリ状態 ----
export const S = {
  tab: 'home', uid: null, pname: '',
  lmode: 'login', lerr: '',
  players: {}, playersMeta: {}, roulette: null, stocks: {},
  companies: {},
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
    {id:'home',     icon:'🏠', label:'ホーム'},
    {id:'deposit',  icon:'🏦', label:'預金'},
    {id:'roulette', icon:'🎰', label:'ルーレット'},
    {id:'invest',   icon:'📈', label:'投資'},
    {id:'company',  icon:'🏢', label:'会社'},
    {id:'ranking',  icon:'🏆', label:'ランキング'},
    {id:'rules',    icon:'📖', label:'ルール'},
  ];
  if (!mainRendered) {
    mainRendered = true;
    document.getElementById('app').innerHTML = `
      <div class="header">
        <span class="logo">🏛 COINS架空市場</span><span class="spacer"></span>
        <span class="badge badge-dark" id="hdr-name"></span>
        <button class="btn" style="font-size:12px;padding:5px 10px"
                onclick="W.logout()">ログアウト</button>
      </div>
      <div class="tab-bar" id="tab-bar"></div>
      <div class="panel" id="main-panel"></div>`;
  }
  const hdr = document.getElementById('hdr-name');
  if (hdr) hdr.textContent = p.name || S.pname || '';
  const tb = document.getElementById('tab-bar');
  if (tb) tb.innerHTML = TABS.map(t =>
    `<button class="tab ${S.tab===t.id?'active':''}"
             onclick="W._setTab('${t.id}')">${t.icon} ${t.label}</button>`
  ).join('');
}

export function renderPanel(p) {
  const panel = document.getElementById('main-panel'); if (!panel) return;
  let html = '';
  if (S.tab==='home')     html = buildHome(p);
  if (S.tab==='deposit')  html = buildDeposit(p);
  if (S.tab==='roulette') html = buildRoulette(p, S);
  if (S.tab==='invest')   html = buildInvest(p, S);
  if (S.tab==='company')  html = buildCompany(p, S);
  if (S.tab==='ranking')  html = buildRanking(S);
  if (S.tab==='rules')    html = buildRules();
  panel.innerHTML = html;
}

export function resetMain() { mainRendered = false; }

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
  const interval = calcTicketInterval(p);
  const elapsed  = S.now - (p.lastTicketTime||S.now);
  const secLeft  = Math.ceil(Math.max(0, interval - elapsed%interval) / 1000);
  const totalT   = (p.tickets||0) + (p.rareTickets||0);
  const {depBal, tdepBal} = calcInterestWithTrait(p);
  let invVal = 0;
  for (const [sym,qty] of Object.entries(p.holdings||{}))
    if (S.stocks[sym]) invVal += S.stocks[sym].price*(qty||0);
  // 表示上の総資産（利息込み）
  const displayTotal = r((p.coins||0) + depBal + tdepBal + (p.rouletteBet||0) + r(invVal));
  const els = {
    'mv-hand':  fmt(r(p.coins||0)),
    'mv-total': fmt(displayTotal),
    'mv-tick':  String(p.tickets||0),
    'mv-rare':  String(p.rareTickets||0),
    'mv-next':  `${totalT}/100枚 | 次回: ${secLeft}秒後`,
  };
  for (const [id,val] of Object.entries(els)) {
    const el = document.getElementById(id); if (el) el.textContent = val;
  }
  const pf = document.getElementById('tick-fill');
  if (pf) pf.style.width = `${totalT}%`;
  if (S.roulette && S.tab==='roulette') {
    const tl = Math.max(0, S.roulette.next - S.now);
    const rt = document.getElementById('r-timer');
    if (rt) rt.textContent = tl<500 ? '🔴 開催中！' : `${Math.floor(tl/60000)}分${Math.floor((tl%60000)/1000)}秒後`;
    const rf = document.getElementById('r-fill');
    if (rf) rf.style.width = `${Math.min(100,(1-tl/3600000)*100)}%`;
  }
}

// ============================================================
//  ホーム画面
// ============================================================
function buildHome(p) {
  const now      = S.now;
  const interval = calcTicketInterval(p); // 引数なし
  const elapsed  = now - (p.lastTicketTime||now);
  const secLeft  = Math.ceil(Math.max(0, interval - elapsed%interval) / 1000);
  const totalT   = (p.tickets||0) + (p.rareTickets||0);
  const {depBal, tdepBal} = calcInterestWithTrait(p);
  let invVal = 0;
  for (const [sym,qty] of Object.entries(p.holdings||{}))
    if (S.stocks[sym]) invVal += S.stocks[sym].price*(qty||0);
  invVal = r(invVal);
  const displayTotal = r((p.coins||0) + depBal + tdepBal + (p.rouletteBet||0) + invVal);
  const nt = p.tickets||0, nr = p.rareTickets||0;
  const limit      = calcBetLimit(p, S.playersMeta);
  const usage      = currentBetUsage(p);
  const usagePct   = limit>0 ? Math.min(100, r(usage/limit*100)) : 0;
  const limitColor = usagePct>=90 ? '#c0392b' : usagePct>=70 ? '#e67e22' : '#1d9e75';
  const avg        = avgAsset(S.playersMeta);
  const myTotal    = rankTotal(p);
  const isUnderAvg = myTotal < avg;
  const rareProb   = r(calcRareProb(p)*100); // 引数なし
  const intervalSec= r(interval/1000);
  const nowDate    = new Date(now);
  const nextMid    = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()+1);
  const sToMid     = Math.floor((nextMid-nowDate)/1000);
  const hToMid     = Math.floor(sToMid/3600);
  const mToMid     = Math.floor((sToMid%3600)/60);

  // 特性情報（ui.js内ではインライン定義）
  const traitMap = {
    worker:    { label:'仕事人',    color:'#e74c3c', icon:'⚒', buff:'チケット生成速度が通常の1.5倍（40秒/枚）' },
    manager:   { label:'経営者',    color:'#2980b9', icon:'👔', buff:'1位補正ボーナスを2倍受け取る' },
    negotiator:{ label:'交渉者',    color:'#f39c12', icon:'🤝', buff:'株価への購入影響力が2倍' },
    balancer:  { label:'バランサー',color:'#27ae60', icon:'⚖', buff:'レアチケット確率+10%（通常10%→20%）' },
    accountant:{ label:'会計士',    color:'#8e44ad', icon:'📊', buff:'預金1.2%/日・定期2.4%/日（通常の1.2倍）' },
  };
  const trait    = p.trait || null;
  const traitInfo= trait ? traitMap[trait] : null;

  return `
  <div class="metrics">
    <div class="metric"><div class="ml">手持ち</div>
      <div class="mv din"><span id="mv-hand">${fmt(r(p.coins||0))}</span><span class="mu"> C</span></div></div>
    <div class="metric"><div class="ml">総資産(評価)</div>
      <div class="mv din"><span id="mv-total">${fmt(displayTotal)}</span><span class="mu"> C</span></div></div>
    <div class="metric"><div class="ml">チケット</div>
      <div class="mv din"><span id="mv-tick">${nt}</span><span class="mu">枚</span></div></div>
    <div class="metric"><div class="ml" style="color:#7a5c00">★ レア</div>
      <div class="mv din" style="color:#7a5c00"><span id="mv-rare">${nr}</span><span class="mu">枚</span></div></div>
  </div>

  ${traitInfo ? `
  <div style="display:flex;align-items:center;gap:10px;background:#fff;border:2px solid ${traitInfo.color};
               border-radius:10px;padding:10px 14px;margin-bottom:12px">
    <span style="font-size:24px">${traitInfo.icon}</span>
    <div style="flex:1">
      <div style="font-weight:700;color:${traitInfo.color};font-size:14px">${traitInfo.label}</div>
      <div style="font-size:12px;color:#555;margin-top:2px">🎯 ${traitInfo.buff}</div>
    </div>
    <button class="btn btn-sm" onclick="W.showTraitModal('${trait}')"
            ${(p.coins||0)<2000?'disabled':''}>変更 (2000 C)</button>
  </div>` : `
  <div style="background:#fff;border:1px solid #e0ddd8;border-radius:8px;padding:8px 14px;margin-bottom:12px">
    <span class="hint">特性未付与 — ページを再読み込みしてください</span>
  </div>`}

  ${isUnderAvg ? `
  <div class="bonus-indicator">
    <span style="font-size:20px">📈</span>
    <div>
      <div style="font-weight:700;font-size:13px">デイリー逆転ボーナス対象</div>
      <div class="hint">総資産が全体平均を下回っています</div>
      <div class="hint">次回ボーナスまで: <strong>${hToMid}時間${mToMid}分</strong></div>
    </div>
  </div>` : ''}

  <div class="card">
    <div class="row" style="margin-bottom:5px">
      <span style="font-weight:700;font-size:13px">賭け上限</span>
      <span class="spacer"></span>
      <span style="font-size:12px">使用: <strong class="din">${fmt(usage)}</strong> /
            上限: <strong class="din">${fmt(limit)}</strong> COIN</span>
    </div>
    <div class="limit-bar">
      <div class="limit-fill" style="width:${usagePct}%;background:${limitColor}"></div>
    </div>
    <div class="hint" style="margin-top:4px">ルーレットベット＋投資コストの合計上限</div>
  </div>

  <div class="card">
    <div class="row" style="margin-bottom:7px">
      <span class="card-title" style="margin:0">チケット</span><span class="spacer"></span>
      <span class="hint" id="mv-next">${totalT}/100枚 | 次回: ${secLeft}秒後</span>
    </div>
    <div class="progress-bar" style="margin-bottom:12px">
      <div class="progress-fill" id="tick-fill" style="width:${totalT}%"></div>
    </div>
    <div class="ticket-section">
      <div class="ticket-row">
        <span class="ticket-label">🎟 チケット（×1 COIN）</span>
        <span class="badge badge-blue">${nt}枚</span>
      </div>
      <div class="ticket-controls">
        <button class="btn btn-sm" onclick="W._qt('n',1)"     ${nt<1?'disabled':''}>1枚</button>
        <button class="btn btn-sm" onclick="W._qt('n',10)"    ${nt<10?'disabled':''}>10枚</button>
        <button class="btn btn-sm" onclick="W._qt('n',${nt})" ${nt<1?'disabled':''}>全部(${nt}枚)</button>
        <input class="input" id="conv-n" type="number" min="1" max="${nt}"
               value="1" style="width:65px" ${nt<1?'disabled':''}/>
        <button class="btn btn-primary" onclick="W.useTicket('normal')"
                ${nt<1?'disabled':''}>変換</button>
      </div>
    </div>
    <div class="ticket-section" style="margin-top:10px">
      <div class="ticket-row">
        <span class="ticket-label">★ レアチケット（×1〜10 COIN）</span>
        <span class="badge badge-gold">${nr}枚</span>
      </div>
      <div class="ticket-controls">
        <button class="btn btn-sm" onclick="W._qt('r',1)"     ${nr<1?'disabled':''}>1枚</button>
        <button class="btn btn-sm" onclick="W._qt('r',5)"     ${nr<5?'disabled':''}>5枚</button>
        <button class="btn btn-sm" onclick="W._qt('r',${nr})" ${nr<1?'disabled':''}>全部(${nr}枚)</button>
        <input class="input" id="conv-r" type="number" min="1" max="${nr}"
               value="1" style="width:65px" ${nr<1?'disabled':''}/>
        <button class="btn btn-gold" onclick="W.useTicket('rare')"
                ${nr<1?'disabled':''}>まとめて使用</button>
      </div>
    </div>
  </div>

  ${p.deposit?.principal>0 ? `
  <div class="card"><div class="row">
    <span class="hint-label">🏦 普通預金</span><span class="spacer"></span>
    <span class="badge badge-blue din">${fmt(depBal)} COIN</span>
  </div><div class="hint" style="margin-top:3px">
    元本 <span class="din">${fmt(r(p.deposit.principal))}</span> C | 利率 1%/日
  </div></div>` : ''}

  ${p.termDeposit?.principal>0 ? `
  <div class="card"><div class="row">
    <span class="hint-label">🔒 定期預金</span><span class="spacer"></span>
    <span class="badge badge-purple din">${fmt(tdepBal)} COIN</span>
  </div><div class="hint" style="margin-top:3px">
    元本 <span class="din">${fmt(r(p.termDeposit.principal))}</span> C |
    利率 2%/日 | ${p.termDeposit.days}日満期
  </div></div>` : ''}

  ${(p.rouletteBet||0)>0 ? `
  <div class="card"><div class="row">
    <span class="hint-label">🎰 ルーレット待機中</span><span class="spacer"></span>
    <span class="badge badge-red din">${fmt(r(p.rouletteBet))} COIN</span>
  </div></div>` : ''}

  ${invVal>0 ? `
  <div class="card"><div class="row">
    <span class="hint-label">📈 投資評価額</span><span class="spacer"></span>
    <span class="badge badge-green din">${fmt(invVal)} COIN</span>
  </div></div>` : ''}`;
}

// ============================================================
//  預金画面（翌日反映対応版）
// ============================================================
function buildDeposit(p) {
  const {depBal, tdepBal} = calcInterestWithTrait(p);
  const now    = Date.now();
  const tdl    = p.termDeposit
    ? Math.max(0, p.termDeposit.days - (now-p.termDeposit.since)/86400000)
    : 0;
  const coins  = r(p.coins||0);
  const isDebt = coins < 0; // マイナス残高（借金）

  return `
  ${isDebt ? `
  <div style="background:#fff0f0;border:1px solid #fecaca;border-radius:8px;
              padding:10px 14px;margin-bottom:12px;display:flex;gap:8px;align-items:center">
    <span style="font-size:20px">⚠️</span>
    <div>
      <div style="font-weight:700;color:#c0392b;font-size:13px">借金状態</div>
      <div style="font-size:12px;color:#991b1b">
        現在の残高: <span class="din">${fmt(coins)}</span> COIN
        （会社経営の損失などにより残高がマイナスになっています）
      </div>
    </div>
  </div>` : ''}

  <div class="card">
    <div class="card-title">普通預金
      <span class="hint" style="font-weight:400">利率 1%/日（複利）・引き出しは翌日0時反映</span>
    </div>
    ${p.deposit?.principal>0 ? `
      <div class="row" style="margin-bottom:6px">
        <span class="hint-label">現在の残高（利息込み）</span><span class="spacer"></span>
        <span class="badge badge-blue din">${fmt(depBal)} COIN</span>
      </div>
      <div class="hint" style="margin-bottom:10px">
        元本 <span class="din">${fmt(r(p.deposit.principal))}</span> C
        ${p.deposit.pendingWithdrawal ? `
          <span style="color:#e67e22;font-weight:700;margin-left:8px">
            ⏳ 引き出し予約済み（翌日0時に処理）
          </span>` : ''}
      </div>
      <div class="row" style="gap:6px">
        ${!p.deposit.pendingWithdrawal ? `
          <input class="input" id="dep-add" type="number" min="1"
                 placeholder="追加額" style="max-width:130px"/>
          <button class="btn btn-primary" onclick="W.addDeposit()">追加預金</button>
          <button class="btn btn-danger" onclick="W.withdrawDeposit()">
            引き出しリクエスト（翌日反映）
          </button>
        ` : `
          <button class="btn" onclick="W.cancelWithdrawDeposit()">
            引き出しキャンセル
          </button>
        `}
      </div>` : `
      <div class="row">
        <input class="input" id="dep-in" type="number" min="1"
               placeholder="預金額" style="flex:1"/>
        <button class="btn btn-primary" onclick="W.doDeposit()">預ける</button>
      </div>
      <div class="hint" style="margin-top:6px">
        手持ち: <span class="din">${fmt(coins)}</span> COIN
      </div>`}
  </div>

  <div class="card">
    <div class="card-title">定期預金
      <span class="hint" style="font-weight:400">利率 2%/日（複利）・7日以上・引き出しは翌日0時反映</span>
    </div>
    ${p.termDeposit?.principal>0 ? `
      <div class="row" style="margin-bottom:6px">
        <span class="hint-label">現在の残高（利息込み）</span><span class="spacer"></span>
        <span class="badge badge-purple din">${fmt(tdepBal)} COIN</span>
      </div>
      <div class="hint" style="margin-bottom:10px">
        元本 <span class="din">${fmt(r(p.termDeposit.principal))}</span> C |
        満期まで ${tdl.toFixed(1)} 日
        ${tdl<=0 ? '<strong style="color:#166534"> ✓ 満期済み</strong>' : ''}
        ${p.termDeposit.pendingWithdrawal ? `
          <span style="color:#e67e22;font-weight:700;margin-left:8px">
            ⏳ 引き出し予約済み（翌日0時に処理）
          </span>` : ''}
      </div>
      ${!p.termDeposit.pendingWithdrawal ? `
        <button class="btn ${tdl>0?'btn-danger':''}"
                onclick="W.withdrawTermDeposit()">
          ${tdl>0
            ? `期限前解約リクエスト（元本 <span class="din">${fmt(r(p.termDeposit.principal))}</span> C・翌日反映）`
            : `満期引き出しリクエスト（<span class="din">${fmt(tdepBal)}</span> C・翌日反映）`}
        </button>
      ` : `
        <button class="btn" onclick="W.cancelWithdrawTermDeposit()">
          引き出しキャンセル
        </button>
      `}` : `
      <div class="row" style="gap:6px">
        <input class="input" id="tdep-in" type="number" min="1"
               placeholder="預金額" style="flex:2;min-width:90px"/>
        <input class="input" id="tdep-days" type="number" min="7"
               value="7" placeholder="日数" style="flex:1;max-width:80px"/>
        <button class="btn btn-primary" onclick="W.doTermDeposit()">定期預け</button>
      </div>
      <div class="hint" style="margin-top:6px">
        手持ち: <span class="din">${fmt(coins)}</span> COIN
      </div>`}
  </div>`;
}
