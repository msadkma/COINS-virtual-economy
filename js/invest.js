// ============================================================
//  js/invest.js  株式売買UI（Cloud Functions版）
// ============================================================
import { callFn, toast, fmt, r, esc,
         calcBetLimit, currentBetUsage } from './firebase.js';
import { S, withSubmit } from './ui.js';

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
  const limit       = calcBetLimit(p, S.playersMeta);
  const usage       = currentBetUsage(p);
  const remainLimit = Math.max(0, limit - usage);

  let html = `
  <div class="card" style="margin-bottom:12px">
    <div class="row">
      <span style="font-size:13px;font-weight:700">投資可能残枠</span><span class="spacer"></span>
      <span class="din" style="font-weight:700;color:${remainLimit<=0?'#c0392b':'#166534'}">${fmt(remainLimit)} COIN</span>
    </div>
    <div class="hint" style="margin-top:4px">ルーレットベット + 投資コストが賭け上限を超えることはできません</div>
  </div>
  <div class="hint" style="margin-bottom:10px">★ 株価は12時間ごとに更新 | 40%の確率で変動方向が逆転</div>`;

  for (const [sym, s] of Object.entries(S.stocks)) {
    const held = r(p.holdings?.[sym] || 0);
    const hist = s.history || [s.price];
    const prev = hist.length > 1 ? hist[hist.length-2] : s.price;
    const chg  = r(s.price) - r(prev);
    const mn   = Math.min(...hist), mx = Math.max(...hist), rng = mx - mn || 1;
    const pts  = hist.map((v,i) => `${i/(hist.length-1||1)*200},${36-(v-mn)/rng*30}`).join(' ');
    const hLeft = Math.max(0, Math.floor(((s.nextUpdate||0) - S.now) / 3600000));
    const mLeft = Math.max(0, Math.floor((((s.nextUpdate||0) - S.now) % 3600000) / 60000));

    html += `<div class="card">
      <div class="row" style="margin-bottom:4px">
        <span style="font-weight:800;font-size:14px">${esc(sym)}</span>
        <span class="hint" style="margin-left:2px">${esc(s.name)}</span><span class="spacer"></span>
        <span class="din" style="font-weight:700;font-size:18px">${fmt(r(s.price))}</span>
        <span style="font-size:12px;margin-left:2px">C</span>
        <span class="${chg>=0?'price-up':'price-down'} din" style="font-size:13px">${chg>=0?'+':''}${fmt(chg)}</span>
      </div>
      <svg viewBox="0 0 200 40" style="width:100%;height:44px;display:block;margin-bottom:5px">
        <polyline points="${pts}" fill="none" stroke="${chg>=0?'#1d9e75':'#c0392b'}" stroke-width="1.5"/>
      </svg>
      <div class="hint" style="margin-bottom:8px">
        次回更新まで ${hLeft}時間${mLeft}分 |
        保有: <span class="din">${held}</span>株 (≈<span class="din">${fmt(r(held*s.price))}</span> C)
      </div>
      <div class="row" style="gap:6px">
        <input class="input" id="buy-${sym}" type="number" min="1" placeholder="買い株数" style="width:90px"/>
        <button class="btn btn-primary" onclick="W.buyStock('${sym}')"
                ${remainLimit<=0?'disabled':''}>買う</button>
        ${held>0?`
          <input class="input" id="sell-${sym}" type="number" min="1" max="${held}"
                 placeholder="売り株数" style="width:90px"/>
          <button class="btn btn-danger" onclick="W.sellStock('${sym}')">売る</button>`:''}
        <span class="hint">手持ち: <span class="din">${fmt(r(p.coins||0))}</span> C</span>
      </div>
    </div>`;
  }
  return html;
}
