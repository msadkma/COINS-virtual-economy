// ============================================================
//  js/invest.js  株式売買UI（Cloud Functions版）
// ============================================================
import { callFn, fmt, r, esc, calcBetLimit, currentBetUsage } from './firebase.js';
import { S, withSubmit, toast } from './ui.js';

export async function buyStock(symbol) {
  await withSubmit(async () => {
    const qty = parseInt(document.getElementById('buy-' + symbol)?.value) || 0;
    if (qty <= 0) { toast('株数を入力してください'); return; }
    const data = await callFn('invest', { action: 'buy', symbol, qty });
    toast(`${symbol} ${qty}株を購入 (-${fmt(data.cost)} COIN)`);
  });
}

export async function sellStock(symbol) {
  await withSubmit(async () => {
    const qty = parseInt(document.getElementById('sell-' + symbol)?.value) || 0;
    if (qty <= 0) { toast('株数を入力してください'); return; }
    const data = await callFn('invest', { action: 'sell', symbol, qty });
    toast(`${symbol} ${qty}株を売却 (+${fmt(data.revenue)} COIN)`);
  });
}

// 株価更新は Cloud Functions の scheduledStockUpdate が12時間ごとに自動実行
// クライアント側からの手動呼び出しは不要（互換性のため空関数として残す）
export async function updateStockPrices() { /* no-op: Cloud Functionsが処理 */ }

// ---- 投資UI構築 ----
export function buildInvest(p, S) {
  let html = '';
  const myLimit = calcBetLimit(p, S.playersMeta);
  const myUsage = currentBetUsage(p);

  // 会社リスト
  const companies = {
    ALPHA: "アルファテック（AI開発・高変動）",
    BETA:  "ベータマニュファクチャ（製造・安定）",
    GAMMA: "ガンマバイオ（医療・一発逆転型）"
  };

  for (const sym in companies) {
    const s = S.stocks?.[sym];
    if (!s) continue;

    const name = companies[sym];
    const held = p.holdings?.[sym] || 0;

    // 簡易チャート（直近の履歴5点）
    const history = s.history || [s.price];
    const maxVal  = Math.max(...history, 1);
    const minVal  = Math.min(...history, 0);
    const range   = maxVal - minVal || 1;

    let pts = '';
    history.forEach((val, idx) => {
      const x = (idx / (history.length - 1 || 1)) * 200;
      const y = 40 - ((val - minVal) / range) * 35; // 下づめ
      pts += `${x},${y} `;
    });

    const chg = s.price - (history[history.length - 2] || s.price);
    const nextUpdate = new Date(s.nextUpdate || 0);
    const timeLeft = Math.max(0, nextUpdate.getTime() - Date.now());
    const hLeft = Math.floor(timeLeft / 3600000);
    const mLeft = Math.floor((timeLeft % 3600000) / 60000);

    html += `
    <div class="card" style="margin-bottom:15px">
      <div class="row" style="margin-bottom:5px">
        <span class="badge badge-dark" style="font-size:14px">${esc(sym)}</span>
        <span class="hint" style="margin-left:2px">${esc(name)}</span><span class="spacer"></span>
        <span class="din" style="font-weight:700;font-size:18px">${fmt(r(s.price))}</span>
        <span style="font-size:12px;margin-left:2px">C</span>
        <span class="${chg>=0?'price-up':'price-down'} din" style="font-size:13px">${chg>=0?'+':''}${fmt(chg)}</span>
      </div>
      <svg viewBox="0 0 200 40" style="width:100%;height:44px;display:block;margin-bottom:5px">
        <polyline points="${pts}" fill="none" stroke="${chg>=0?'#1d9e75':'#c0392b'}\" stroke-width=\"1.5\"/>
      </svg>
      <div class="hint" style="margin-bottom:8px">
        次回更新まで ${hLeft}時間${mLeft}分 |
        保有: <span class="din">${held}</span>株 (≈<span class="din">${fmt(r(held*s.price))}</span> C)
      </div>
      <div class="row" style="gap:6px">
        <input class="input" id="buy-${sym}" type="number" min="1" placeholder="買い株数" style="width:90px"/>
        <button class="btn btn-primary" onclick="W.buyStock('${sym}')">買い</button>
        <input class="input" id="sell-${sym}" type="number" min="1" placeholder="売り株数" style="width:90px;margin-left:auto"/>
        <button class="btn btn-danger" onclick="W.sellStock('${sym}')">売り</button>
      </div>
    </div>`;
  }

  if (!html) {
    return `<div class="card"><div class="card-body">銘柄データがありません</div></div>`;
  }

  return `
    <div class="invest-container">
      <div class="card" style="margin-bottom:15px;background:#fcfcfc">
        <div class="card-body hint">
          💡 <strong>株式投資ルール</strong><br/>
          株価は12時間ごとに、全プレイヤーの総保有量に応じて変動します（多く買われると上昇しやすくなります）。<br/>
          株式購入コストもルーレット同様、<strong>リスク限界値（上限 ${fmt(myLimit)} C）</strong> の対象に含まれます。<br/>
          現在のあなたのリスク使用量: <span class="font-red din">${fmt(myUsage)}</span> C
        </div>
      </div>
      ${html}
    </div>
  `;
}
