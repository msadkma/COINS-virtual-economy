// ============================================================
//  js/ui.js  メインUI管理・画面レンダリング統合版
// ============================================================
import { auth, fmt, r, esc, rankTotal, calcBetLimit, currentBetUsage, callFn } from './firebase.js';
import { buildRanking } from './ranking.js';
import { buildInvest } from './invest.js';

// グローバル状態オブジェクト
export const S = {
  uid: null,
  player: null,
  playersMeta: {},
  stocks: {},
  roulette: {},
  currentTab: 'ranking' // 初期タブ
};

// 連続クリック防止フラグ
let isSubmitting = false;

/**
 * 処理中フラグの制御ヘルパー
 */
export async function withSubmit(fn) {
  if (isSubmitting) return;
  isSubmitting = true;
  document.body.classList.add('loading');
  try {
    await fn();
  } catch (e) {
    toast(e.message || 'エラーが発生しました');
  } finally {
    isSubmitting = false;
    document.body.classList.remove('loading');
  }
}

/**
 * トースト通知を表示
 */
export function toast(msg) {
  const container = document.getElementById('toast-container') || createToastContainer();
  const t = document.createElement('div');
  t.className = 'toast-item';
  t.innerText = msg;
  container.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 4000);
}

function createToastContainer() {
  const c = document.createElement('div');
  c.id = 'toast-container';
  document.body.appendChild(c);
  return c;
}

/**
 * タブ切り替え関数
 */
export function switchTab(tabId) {
  S.currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  render();
}

// ============================================================
//  通常預金・定期預金用操作関数
// ============================================================

export async function depositCoins() {
  await withSubmit(async () => {
    const amtInput = document.getElementById('deposit-amount');
    const amount = parseInt(amtInput?.value) || 0;
    if (amount <= 0) { toast('正しい金額を入力してください'); return; }
    await callFn('deposit', { action: 'deposit', amount });
    toast(`通常預金に ${fmt(amount)} COIN を預け入れました`);
    if (amtInput) amtInput.value = '';
  });
}

export async function addDepositCoins() {
  await withSubmit(async () => {
    const amtInput = document.getElementById('deposit-add-amount');
    const amount = parseInt(amtInput?.value) || 0;
    if (amount <= 0) { toast('正しい金額を入力してください'); return; }
    await callFn('deposit', { action: 'add', amount });
    toast(`通常預金に ${fmt(amount)} COIN を追加しました`);
    if (amtInput) amtInput.value = '';
  });
}

/**
 * 【修正】通常預金の引き出し申請（即時払いから、翌日予約制へと最小限の変更）
 */
export async function withdrawDeposit() {
  await withSubmit(async () => {
    const result = await callFn('deposit', { action: 'withdraw' });
    if (result.status === 'reserved') {
      const availDate = new Date(result.availableAt);
      const timeStr = availDate.toLocaleString('ja-JP');
      toast(`【引き出し予約】確定しました。\n翌日以降に受け取れます。\n受取可能: ${timeStr}`);
    }
  });
}

/**
 * 【新設】翌日以降に、予約された預金コインをお財布へ受け取る
 */
export async function claimWithdrawal() {
  await withSubmit(async () => {
    try {
      const result = await callFn('deposit', { action: 'claim_withdraw' });
      toast(`【受け取り完了】予約されていた ${fmt(result.returned)} COIN を受け取りました！`);
    } catch (error) {
      toast(`受け取り失敗: ${error.message}`);
    }
  });
}

export async function createTermDeposit() {
  await withSubmit(async () => {
    const amtInput = document.getElementById('term-amount');
    const daysInput = document.getElementById('term-days');
    const amount = parseInt(amtInput?.value) || 0;
    const days = parseInt(daysInput?.value) || 7;
    if (amount <= 0) { toast('正しい金額を入力してください'); return; }
    if (days < 7) { toast('定期預金は7日以上で指定してください'); return; }
    await callFn('deposit', { action: 'term_deposit', amount, days });
    toast(`満期 ${days} 日の定期預金（元本: ${fmt(amount)} COIN）を開始しました`);
    if (amtInput) amtInput.value = '';
  });
}

export async function withdrawTermDeposit() {
  await withSubmit(async () => {
    const data = await callFn('deposit', { action: 'term_withdraw' });
    toast(`定期預金から ${fmt(data.returned)} COIN を引き出しました`);
  });
}

// ============================================================
//  元のデザインを100%活かした預金UI構築処理
// ============================================================
function buildDeposit(p) {
  const now = Date.now();
  
  // 通常預金
  const dep = p.deposit || null;
  let currentNormalBalance = 0;
  if (dep) {
    const elapsedDays = (now - dep.since) / 86400000;
    currentNormalBalance = Math.round(dep.principal * Math.pow(1.01, elapsedDays));
  }

  // 【追加】翌日引き出し予約がある場合のステータス表示
  const reservation = p.withdrawalReservation || null;
  let reservationHtml = '';
  if (reservation) {
    const availDate = new Date(reservation.availableAt);
    const timeStr = availDate.toLocaleString('ja-JP');
    const isAvailable = now >= reservation.availableAt;
    
    reservationHtml = `
      <div class="card" style="margin-top:15px; border-left: 4px solid #e67e22; background: #fffdf9;">
        <div class="card-body">
          <h4 style="color:#e67e22; margin-top:0;">⏳ 預金の引き出し予約状況</h4>
          <div class="row" style="margin-bottom:8px;">
            <span>予約金額:</span><span class="spacer"></span>
            <span class="din" style="font-weight:700; color:#e67e22;">${fmt(reservation.amount)}</span> COIN
          </div>
          <div class="hint" style="margin-bottom:10px;">
            確定予定日時: <strong>${timeStr}</strong>
          </div>
          ${isAvailable 
            ? `<button class="btn btn-primary" style="width:100%; font-weight:700; background:#2ecc71;" onclick="W.claimWithdrawal()">💰 コインを受け取る</button>`
            : `<button class="btn" style="width:100%; background:#95a5a6; color:#fff; cursor:not-allowed;" disabled>⏳ まだ確定時間になっていません</button>`
          }
        </div>
      </div>
    `;
  }

  // 定期預金
  const td = p.termDeposit || null;
  let currentTermBalance = 0;
  let termInfoHtml = '<div class="hint">現在、定期預金はありません</div>';
  if (td) {
    const elapsedDays = (now - td.since) / 86400000;
    const isMatured = elapsedDays >= td.days;
    currentTermBalance = isMatured 
      ? Math.round(td.principal * Math.pow(1.02, elapsedDays))
      : Math.round(td.principal);

    const startDate = new Date(td.since).toLocaleDateString('ja-JP');
    termInfoHtml = `
      <div class="row hint">開始日: ${startDate} (${td.days}日間)</div>
      <div class="row" style="margin-top:5px; font-weight:700;">
        <span>現在の価値 (満期時+2%/日):</span><span class="spacer"></span>
        <span class="din">${fmt(currentTermBalance)}</span> COIN
      </div>
      <div class="hint" style="color: ${isMatured ? '#27ae60':'#c0392b'}; font-weight:bold; margin-top:5px;">
        ${isMatured ? '🎉 満期を達成しました！' : `⏳ 満期まであと ${Math.ceil(td.days - elapsedDays)} 日`}
      </div>
      <button class="btn" style="width:100%; margin-top:10px; background:#e74c3c; color:#fff;" onclick="W.withdrawTermDeposit()">
        ${isMatured ? '定期預金を引き出す' : '中途解約して元本を引き出す'}
      </button>
    `;
  }

  return `
    <div class="deposit-container">
      <div class="card">
        <div class="card-header">🏦 通常預金 (利息: 複利 1% / 日)</div>
        <div class="card-body">
          <div class="row" style="font-size:18px; font-weight:700; margin-bottom:15px;">
            <span>現在の預金総額:</span><span class="spacer"></span>
            <span class="din" style="color:#2980b9;">${fmt(currentNormalBalance)}</span> COIN
          </div>
          
          ${!dep ? `
            <div class="row" style="gap:6px; margin-bottom:10px;">
              <input class="input" id="deposit-amount" type="number" min="1" placeholder="新規預入額" style="flex:1"/>
              <button class="btn btn-primary" onclick="W.depositCoins()">新規預入</button>
            </div>
          ` : `
            <div class="row" style="gap:6px; margin-bottom:15px;">
              <input class="input" id="deposit-add-amount" type="number" min="1" placeholder="追加預入額" style="flex:1"/>
              <button class="btn btn-primary" onclick="W.addDepositCoins()">追加入金</button>
            </div>
            ${!reservation ? `
              <button class="btn btn-primary" style="width:100%; font-weight:700; background:#f39c12;" onclick="W.withdrawDeposit()">
                📤 預金の引き出し申請を行う (翌日確定払い)
              </button>
            ` : ''}
          `}
        </div>
      </div>

      ${reservationHtml}

      <div class="card" style="margin-top:20px;">
        <div class="card-header">🔒 定期預金 (満期時利息: 複利 2% / 日)</div>
        <div class="card-body">
          ${!td ? `
            <div class="row" style="gap:6px; margin-bottom:8px;">
              <input class="input" id="term-amount" type="number" min="1" placeholder="預入額" style="flex:2"/>
              <input class="input" id="term-days" type="number" min="7" value="7" placeholder="日数" style="flex:1"/>
            </div>
            <button class="btn" style="width:100%; background:#34495e; color:#fff;" onclick="W.createTermDeposit()">定期預金を開始する (最低7日)</button>
          ` : termInfoHtml}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
//  メイン描画処理
// ============================================================
export function render() {
  if (!S.player) return;

  const p = S.player;
  const myTotal = rankTotal(p);
  const myLimit = calcBetLimit(p, S.playersMeta);
  const myUsage = currentBetUsage(p);

  const headerHtml = `
    <div class="user-profile">
      <span class="user-name">👤 ${esc(p.name)}</span>
      <span class="user-trait font-orange">【${esc(p.trait === 'worker' ? '労働者' : p.trait === 'balancer' ? '投資家' : '一般')}】</span>
    </div>
    <div class="asset-summary">
      <div class="asset-item">
        <span class="label">💰 所持金:</span>
        <span class="value din font-green">${fmt(p.coins || 0)}</span> <span class="unit">COIN</span>
      </div>
      <div class="asset-item">
        <span class="label">📊 総資産:</span>
        <span class="value din">${fmt(myTotal)}</span> <span class="unit">COIN</span>
      </div>
      <div class="asset-item">
        <span class="label">⚠️ リスク限界値:</span>
        <span class="value din" style="color:#c0392b;">${fmt(myUsage)}</span> / <span class="value din">${fmt(myLimit)}</span>
      </div>
    </div>
  `;
  const headerEl = document.getElementById('game-header');
  if (headerEl) headerEl.innerHTML = headerHtml;

  const mainContentEl = document.getElementById('main-content');
  if (!mainContentEl) return;

  switch (S.currentTab) {
    case 'ranking':
      mainContentEl.innerHTML = buildRanking(S);
      break;
    case 'deposit':
      mainContentEl.innerHTML = buildDeposit(p);
      break;
    case 'invest':
      mainContentEl.innerHTML = buildInvest(p, S);
      break;
    default:
      mainContentEl.innerHTML = `<div class="card"><div class="card-body">タブがありません</div></div>`;
  }
}
