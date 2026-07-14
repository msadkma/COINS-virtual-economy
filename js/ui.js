// ============================================================
//  js/ui.js  メインUI管理・画面レンダリング統合版
// ============================================================
import { auth, fmt, r, esc, rankTotal, calcBetLimit, currentBetUsage } from './firebase.js';
import { buildRanking } from './ranking.js';
import { buildInvest } from './invest.js';
// 【修正】新しく作成した deposit.js からUIビルド関数を読み込む
import { buildDeposit } from './deposit.js';

// グローバル状態オブジェクト
export const S = {
  uid: null,
  player: null,
  playersMeta: {},
  stocks: {},
  roulette: {},
  companies: {}, // 会社システム用
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
  // 全タブボタンの活性状態を更新
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  render();
}

/**
 * メインレンダリング関数（データ更新時に自動で呼び出される）
 */
export function render() {
  if (!S.player) return;

  // 1. ヘッダー情報の更新（所持金、ユーザー名など）
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

  // 2. 現在 アクティブなタブ コンテンツの構築
  const mainContentEl = document.getElementById('main-content');
  if (!mainContentEl) return;

  switch (S.currentTab) {
    case 'ranking':
      mainContentEl.innerHTML = buildRanking(S);
      break;
    case 'deposit':
      // 【修正】新しく書き換えた翌日引き出し予約・確定ロジックを含むUIを表示
      mainContentEl.innerHTML = buildDeposit(p, S);
      break;
    case 'invest':
      mainContentEl.innerHTML = buildInvest(p, S);
      break;
    default:
      mainContentEl.innerHTML = `<div class="card"><div class="card-body">タブがありません</div></div>`;
  }
}
