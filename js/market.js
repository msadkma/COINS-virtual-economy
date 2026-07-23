// ============================================================
//  js/market.js  生産・販売所タブ
// ============================================================
import { callFn, toast, fmt, r, esc } from './firebase.js';
import { S, withSubmit } from './ui.js';

// ---- 生産アイテム定義（サーバー側と同期） ----
export const PRODUCT_TYPES = {
  term_ticket:  { name:"定期預金即引出チケット",    cost:100,   icon:"📄",
                  desc:"利息込みで定期預金を即時引き出せる（1枚1回限り）" },
  roulette_tip: { name:"ルーレット当選番号速報",    cost:20000, icon:"🎯",
                  desc:"10%の確率で次回ルーレットの当選番号が事前にわかる（注: 原価が非常に高い）" },
  trade_viewer: { name:"株売買履歴閲覧装置",        cost:100,   icon:"🔍",
                  desc:"全プレイヤーの株売買履歴を24時間閲覧できる" },
  trait_ticket: { name:"特性変更チケット",          cost:100,   icon:"⚡",
                  desc:"指定した特性に24時間変更できる" },
};
const TRAIT_OPTIONS = [
  { key:"worker",     label:"仕事人" },
  { key:"manager",    label:"経営者" },
  { key:"negotiator", label:"交渉者" },
  { key:"balancer",   label:"バランサー" },
  { key:"accountant", label:"会計士" },
];

// stockKeyから表示名に変換
function stockKeyToName(key) {
  if (key === "term_ticket")  return "📄 定期預金即引出チケット";
  if (key === "roulette_tip") return "🎯 ルーレット当選番号速報";
  if (key === "trade_viewer") return "🔍 株売買履歴閲覧装置";
  const m = key.match(/^trait_ticket_(.+)$/);
  if (m) {
    const tl = { worker:"仕事人", manager:"経営者", negotiator:"交渉者",
                 balancer:"バランサー", accountant:"会計士" };
    return `⚡ 特性変更チケット（${tl[m[1]]||m[1]}）`;
  }
  return key;
}

// ============================================================
//  アイテム使用処理
// ============================================================
export async function useTermTicket() {
  await withSubmit(async () => {
    const data = await callFn('useTermTicket', {});
    toast(`📄 定期預金を利息込みで引き出しました！
      +${fmt(data.returned)} COIN（利息: +${fmt(data.interest)} C）`);
  });
}

export async function useRouletteTip(companyId) {
  await withSubmit(async () => {
    const data = await callFn('useRouletteTip', { companyId });
    if (data.hit) {
      toast(`🎯 当たり！次回ルーレットの当選番号は【${data.winNumber}】です！`, 8000);
    } else {
      toast('🎯 外れ... 今回は当選番号情報はありません', 5000);
    }
  });
}

export async function useTradeViewer() {
  await withSubmit(async () => {
    const data = await callFn('useTradeViewer', {});
    const exp  = new Date(data.expires).toLocaleTimeString('ja-JP');
    toast(`🔍 株売買履歴閲覧装置を使用しました。${exp}まで有効です`, 6000);
  });
}

export async function useTraitTicket(traitTarget, companyId) {
  await withSubmit(async () => {
    const data = await callFn('useTraitTicket', { traitTarget });
    const exp  = new Date(data.expires).toLocaleTimeString('ja-JP');
    toast(`⚡ ${data.message}（${exp}まで）`, 6000);
  });
}
export async function produce(companyId) {
  await withSubmit(async () => {
    const productType  = document.getElementById(`ptype-${companyId}`)?.value;
    const traitTarget  = document.getElementById(`ptrait-${companyId}`)?.value || null;
    if (!productType) { toast('商品種類を選択してください'); return; }
    if (productType === 'trait_ticket' && !traitTarget) {
      toast('特性変更チケットは対象特性を選択してください'); return;
    }
    const data = await callFn('produce', { companyId, productType, traitTarget });
    const interval = data.allTraits ? '90分' : '120分';
    toast(`🏭 ${data.qty}個生産しました！（${data.productName} / 原価計 ${fmt(data.totalCost)} C）次回: ${interval}後`);
  });
}

export async function listProduct(companyId) {
  await withSubmit(async () => {
    const stockKey     = document.getElementById(`list-key-${companyId}`)?.value;
    const qty          = parseInt(document.getElementById(`list-qty-${companyId}`)?.value)||0;
    const pricePerUnit = parseInt(document.getElementById(`list-price-${companyId}`)?.value)||0;
    if (!stockKey)         { toast('出品する商品を選択してください'); return; }
    if (qty <= 0)          { toast('数量を入力してください'); return; }
    if (pricePerUnit <= 0) { toast('価格を入力してください'); return; }
    await callFn('listProduct', { companyId, stockKey, qty, pricePerUnit });
    toast(`${qty}個を ${fmt(pricePerUnit)} C/個 で出品しました`);
  });
}

export async function delistProduct(listingId) {
  await withSubmit(async () => {
    await callFn('delistProduct', { listingId });
    toast('出品を取り下げました');
  });
}

export async function buyProduct(listingId, productName) {
  await withSubmit(async () => {
    const qty = parseInt(document.getElementById(`buy-qty-${listingId}`)?.value)||1;
    if (qty <= 0) { toast('数量を入力してください'); return; }
    const data = await callFn('buyProduct', { listingId, qty });
    toast(`${esc(productName)} ${qty}個を購入しました（-${fmt(data.totalCost)} C）`);
  });
}

// ============================================================
//  マーケットUI構築
// ============================================================
export function buildMarket(p, S) {
  const market    = S.market    || {};
  const companies = S.companies || {};

  const myCompanies = Object.values(companies).filter(c =>
    c.owners && Object.prototype.hasOwnProperty.call(c.owners, S.uid)
  );
  const listings  = Object.values(market).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const myItems   = p.items || {};

  let html = '';

  // ============================================================
  //  生産管理パネル（経営者のみ）
  // ============================================================
  if (myCompanies.length > 0) {
    html += `<div class="card">
      <div class="card-title">🏭 生産管理</div>`;

    for (const c of myCompanies) {
      const meta      = S.playersMeta || {};
      const ALL_T     = ['worker','manager','negotiator','balancer','accountant'];
      const allTraits = ALL_T.every(t =>
        Object.keys(c.owners||{}).some(uid => meta[uid]?.trait === t));
      const intervalMs   = allTraits ? 90*60*1000 : 120*60*1000;
      const elapsed      = Date.now() - (c.lastProducedAt||0);
      const canProduce   = elapsed >= intervalMs;
      const remainMin    = Math.max(0, Math.ceil((intervalMs - elapsed) / 60000));
      const activeOwners = Object.values(c.budget||{}).filter(b=>!b.resigned).length || 1;

      // 在庫集計
      const stock = c.stock || {};
      const stockEntries = Object.entries(stock).filter(([,v])=>v>0);

      html += `
      <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px;margin-bottom:10px">
        <div class="row" style="margin-bottom:8px">
          <span style="font-weight:700">${esc(c.name)}</span>
          ${allTraits ? '<span class="badge badge-gold">★ 全特性揃い（90分/回）</span>' : ''}
          <span class="spacer"></span>
          <span class="hint">予算: <span class="din">${fmt(r(c.totalBudget||0))}</span> C</span>
        </div>

        <div style="margin-bottom:10px">
          <label class="form-label">生産する商品を選択</label>
          <select class="input" id="ptype-${c.id}" style="width:100%;margin-bottom:6px"
                  onchange="document.getElementById('ptrait-wrap-${c.id}').style.display=this.value==='trait_ticket'?'block':'none'">
            <option value="">-- 選択してください --</option>
            ${Object.entries(PRODUCT_TYPES).map(([k,v]) =>
              `<option value="${k}">${v.icon} ${v.name}（原価 ${fmt(v.cost)} C/個）</option>`
            ).join('')}
          </select>
          <div id="ptrait-wrap-${c.id}" style="display:none;margin-bottom:6px">
            <label class="form-label">変更先特性を選択</label>
            <select class="input" id="ptrait-${c.id}" style="width:100%">
              ${TRAIT_OPTIONS.map(t =>
                `<option value="${t.key}">${t.label}</option>`
              ).join('')}
            </select>
          </div>
          <div style="font-size:12px;color:#888;line-height:1.6">
            ⚠ ルーレット当選番号速報は原価が20000 C/個と非常に高額です。<br>
            生産量: 経営者${activeOwners}人分 | 間隔: ${allTraits?'90分':'120分'}/回
          </div>
        </div>

        <div class="row" style="gap:8px">
          <button class="btn btn-primary"
                  onclick="W.produce('${c.id}')"
                  ${!canProduce ? 'disabled' : ''}>
            🏭 生産する（${activeOwners}個）
          </button>
          <span class="hint">
            ${canProduce ? '今すぐ生産できます！' : `次の生産まで ${remainMin} 分`}
          </span>
        </div>

        ${stockEntries.length > 0 ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e0ddd8">
          <label class="form-label">在庫 / 販売所に出品する</label>
          <div style="margin-bottom:8px">
            ${stockEntries.map(([key, qty]) =>
              `<div class="row" style="margin-bottom:4px">
                <span>${stockKeyToName(key)}: <span class="din">${fmt(qty)}</span>個</span>
              </div>`
            ).join('')}
          </div>
          <select class="input" id="list-key-${c.id}" style="width:100%;margin-bottom:6px">
            <option value="">-- 出品する商品 --</option>
            ${stockEntries.map(([key, qty]) =>
              `<option value="${key}">${stockKeyToName(key)}（在庫 ${fmt(qty)}個）</option>`
            ).join('')}
          </select>
          <div class="row" style="gap:6px">
            <input class="input" id="list-qty-${c.id}" type="number"
                   min="1" placeholder="数量" style="width:80px"/>
            <input class="input" id="list-price-${c.id}" type="number"
                   min="1" placeholder="C/個" style="width:90px"/>
            <button class="btn btn-primary btn-sm"
                    onclick="W.listProduct('${c.id}')">出品</button>
          </div>
          <div class="hint" style="margin-top:4px">売上は会社予算に入ります</div>
        </div>` : '<div class="hint" style="margin-top:8px">在庫がありません。生産してから出品できます</div>'}

        ${Object.keys(c.listings||{}).length > 0 ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e0ddd8">
          <div class="hint" style="margin-bottom:6px">出品中:</div>
          ${Object.entries(c.listings||{}).map(([lid, l]) => `
            <div class="row" style="margin-bottom:4px;gap:6px">
              <span class="hint">${stockKeyToName(l.stockKey||'')} ${fmt(l.qty)}個 ×
                <span class="din">${fmt(l.pricePerUnit)}</span> C</span>
              <span class="spacer"></span>
              <button class="btn btn-sm btn-danger"
                      onclick="W.delistProduct('${lid}')">取り下げ</button>
            </div>`).join('')}
        </div>` : ''}
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="card">
      <div class="hint" style="text-align:center;padding:16px">
        会社を経営すると生産・出品ができます。「会社」タブから起業または招待を承認してください。
      </div>
    </div>`;
  }

  // ============================================================
  //  自分のアイテム所持欄（使用ボタン付き）
  // ============================================================
  const itemEntries = Object.entries(myItems).filter(([,v])=>v>0);
  if (itemEntries.length > 0) {
    // ルーレット速報を持っている場合、購入元会社リストを作成
    const hasRouletteTip = myItems['roulette_tip'] > 0;
    const companiesWithTip = Object.values(companies).filter(c =>
      c.rouletteTipResult && c.stock?.roulette_tip > 0
    );

    // 特性変更チケットを持っているか確認
    const traitTickets = Object.entries(myItems).filter(([k,v])=>
      k.startsWith('trait_ticket_') && v > 0
    );

    // 特性チケット期限チェック
    const traitExpires = p.traitTicketExpires;
    const traitActive  = traitExpires && Date.now() < traitExpires;
    const tradeViewerActive = p.tradeViewerExpires && Date.now() < p.tradeViewerExpires;

    html += `<div class="card">
      <div class="card-title">🎒 所持アイテム</div>
      ${traitActive ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;
          padding:8px 12px;margin-bottom:10px;font-size:12px;color:#1d4ed8">
        ⚡ 特性変更チケット効果中（${new Date(traitExpires).toLocaleTimeString('ja-JP')}まで）
      </div>` : ''}
      ${tradeViewerActive ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;
          padding:8px 12px;margin-bottom:10px;font-size:12px;color:#166534">
        🔍 株売買履歴閲覧装置効果中（${new Date(p.tradeViewerExpires).toLocaleTimeString('ja-JP')}まで）
      </div>` : ''}

      ${itemEntries.map(([key, qty]) => {
        const name = stockKeyToName(key);

        // 定期預金即引出チケット
        if (key === 'term_ticket') {
          const hasTd = !!(p.termDeposit?.principal > 0);
          return `<div style="border:1px solid #e0ddd8;border-radius:8px;
                              padding:10px 12px;margin-bottom:8px">
            <div class="row" style="margin-bottom:6px">
              <span style="font-weight:600">${name}</span>
              <span class="spacer"></span>
              <span class="badge badge-blue din">${fmt(qty)}枚</span>
            </div>
            <div class="hint" style="margin-bottom:6px">
              定期預金を利息込みで即時引き出せます（期限前でも利息が付きます）
            </div>
            <button class="btn btn-primary btn-sm"
                    onclick="W.useTermTicket()"
                    ${!hasTd ? 'disabled' : ''}>
              📄 使用する${!hasTd ? '（定期預金なし）' : ''}
            </button>
          </div>`;
        }

        // ルーレット当選番号速報
        if (key === 'roulette_tip') {
          return `<div style="border:1px solid #e0ddd8;border-radius:8px;
                              padding:10px 12px;margin-bottom:8px">
            <div class="row" style="margin-bottom:6px">
              <span style="font-weight:600">${name}</span>
              <span class="spacer"></span>
              <span class="badge badge-blue din">${fmt(qty)}枚</span>
            </div>
            <div class="hint" style="margin-bottom:6px">
              購入元会社を選択して速報を確認してください（10%で当たり）
            </div>
            ${companiesWithTip.length > 0 ? `
            <div class="row" style="gap:6px">
              <select class="input" id="tip-company-sel" style="flex:1">
                ${companiesWithTip.map(c =>
                  `<option value="${c.id}">${esc(c.name)}</option>`
                ).join('')}
              </select>
              <button class="btn btn-primary btn-sm"
                      onclick="W.useRouletteTip(document.getElementById('tip-company-sel').value)">
                🎯 速報を確認
              </button>
            </div>` : `
            <button class="btn btn-sm" disabled>
              購入元会社の速報データが見つかりません
            </button>`}
          </div>`;
        }

        // 株売買履歴閲覧装置
        if (key === 'trade_viewer') {
          return `<div style="border:1px solid #e0ddd8;border-radius:8px;
                              padding:10px 12px;margin-bottom:8px">
            <div class="row" style="margin-bottom:6px">
              <span style="font-weight:600">${name}</span>
              <span class="spacer"></span>
              <span class="badge badge-blue din">${fmt(qty)}枚</span>
            </div>
            <div class="hint" style="margin-bottom:6px">
              使用すると投資タブで全プレイヤーの株売買履歴を24時間閲覧できます
            </div>
            <button class="btn btn-primary btn-sm"
                    onclick="W.useTradeViewer()"
                    ${tradeViewerActive ? 'disabled' : ''}>
              🔍 使用する${tradeViewerActive ? '（効果中）' : ''}
            </button>
          </div>`;
        }

        // 特性変更チケット
        const traitM = key.match(/^trait_ticket_(.+)$/);
        if (traitM) {
          const tl = { worker:"仕事人", manager:"経営者", negotiator:"交渉者",
                       balancer:"バランサー", accountant:"会計士" };
          const targetTrait = traitM[1];
          const isCurrent   = p.trait === targetTrait;
          return `<div style="border:1px solid #e0ddd8;border-radius:8px;
                              padding:10px 12px;margin-bottom:8px">
            <div class="row" style="margin-bottom:6px">
              <span style="font-weight:600">⚡ 特性変更チケット（${tl[targetTrait]||targetTrait}）</span>
              <span class="spacer"></span>
              <span class="badge badge-blue din">${fmt(qty)}枚</span>
            </div>
            <div class="hint" style="margin-bottom:6px">
              24時間だけ「${tl[targetTrait]||targetTrait}」の特性に変更できます
            </div>
            <button class="btn btn-primary btn-sm"
                    onclick="W.useTraitTicket('${targetTrait}')"
                    ${(isCurrent || traitActive) ? 'disabled' : ''}>
              ⚡ 使用する${isCurrent ? '（現在の特性と同じ）' : traitActive ? '（効果中）' : ''}
            </button>
          </div>`;
        }

        // その他
        return `<div class="row" style="margin-bottom:6px">
          <span>${name}</span>
          <span class="spacer"></span>
          <span class="badge badge-green din">${fmt(qty)}個</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ============================================================
  //  販売所（全出品一覧）
  // ============================================================
  html += `<div class="card">
    <div class="card-title">🏪 販売所</div>
    ${listings.length === 0
      ? '<p style="color:#888;text-align:center;padding:20px">現在出品されている商品はありません</p>'
      : listings.map(l => {
          const isMyCompany = l.companyId && companies[l.companyId]?.owners &&
            Object.prototype.hasOwnProperty.call(companies[l.companyId].owners, S.uid);
          const displayName = stockKeyToName(l.stockKey || l.productName || '商品');
          return `
          <div style="border:1px solid #e0ddd8;border-radius:8px;
                      padding:10px 12px;margin-bottom:8px">
            <div class="row" style="margin-bottom:6px">
              <div>
                <div style="font-weight:700;font-size:13px">${displayName}</div>
                <div class="hint">出品: ${esc(l.companyName||'')}</div>
              </div>
              <span class="spacer"></span>
              <div style="text-align:right">
                <div class="din" style="font-weight:700;font-size:16px">
                  ${fmt(l.pricePerUnit)} C
                  <span style="font-size:11px;font-weight:400">/個</span>
                </div>
                <div class="hint">残り ${fmt(l.qty)}個</div>
              </div>
            </div>
            ${!isMyCompany ? `
            <div class="row" style="gap:6px">
              <input class="input" id="buy-qty-${l.id}" type="number"
                     min="1" max="${l.qty}" value="1" style="width:70px"/>
              <button class="btn btn-primary btn-sm"
                      onclick="W.buyProduct('${l.id}','${displayName}')">購入</button>
              <span class="hint">
                手持ち: <span class="din">${fmt(r(p.coins||0))}</span> C
              </span>
            </div>` : '<span class="hint">（自社商品）</span>'}
          </div>`;
        }).join('')}
  </div>`;

  return html;
}
