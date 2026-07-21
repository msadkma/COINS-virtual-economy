// ============================================================
//  js/market.js  生産・販売所タブ
// ============================================================
import { callFn, toast, fmt, r, esc } from './firebase.js';
import { S, withSubmit } from './ui.js';

// ============================================================
//  生産処理
// ============================================================
export async function produce(companyId) {
  await withSubmit(async () => {
    const costPerUnit = parseInt(document.getElementById(`cost-${companyId}`)?.value)||1;
    const data = await callFn('produce', { companyId, costPerUnit });
    const interval = data.allTraits ? '90分' : '120分';
    toast(`🏭 ${data.qty}個生産しました！（原価 ${fmt(costPerUnit)} C/個・計 ${fmt(data.totalCost)} C）次回: ${interval}後`);
  });
}

export async function setProductName(companyId) {
  await withSubmit(async () => {
    const name = document.getElementById(`pname-${companyId}`)?.value.trim();
    if (!name) { toast('商品名を入力してください'); return; }
    await callFn('setProductName', { companyId, productName: name });
    toast(`商品名を「${esc(name)}」に設定しました`);
  });
}

// ============================================================
//  販売所処理
// ============================================================
export async function listProduct(companyId) {
  await withSubmit(async () => {
    const qty          = parseInt(document.getElementById(`list-qty-${companyId}`)?.value)||0;
    const pricePerUnit = parseInt(document.getElementById(`list-price-${companyId}`)?.value)||0;
    if (qty <= 0)          { toast('数量を入力してください'); return; }
    if (pricePerUnit <= 0) { toast('価格を入力してください'); return; }
    await callFn('listProduct', { companyId, qty, pricePerUnit });
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

  // 自分が経営している会社（owners オブジェクトのキーで判定）
  const myCompanies = Object.values(companies).filter(c =>
    c.owners && Object.prototype.hasOwnProperty.call(c.owners, S.uid)
  );

  // 全出品リスト
  const listings = Object.values(market).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  // 自分が持っているアイテム
  const myItems = p.items || {};

  let html = '';

  // ============================================================
  //  生産管理パネル（経営者のみ）
  // ============================================================
  if (myCompanies.length > 0) {
    html += `<div class="card">
      <div class="card-title">🏭 生産管理</div>`;

    for (const c of myCompanies) {
      const meta      = S.playersMeta || {};
      const ALL_TRAITS = ['worker','manager','negotiator','balancer','accountant'];
      const allTraits  = ALL_TRAITS.every(t =>
        Object.keys(c.owners||{}).some(uid => meta[uid]?.trait === t)
      );
      const intervalMs   = allTraits ? 90*60*1000 : 120*60*1000;
      const lastProduced = c.lastProducedAt || 0;
      const now          = Date.now();
      const elapsed      = now - lastProduced;
      const canProduce   = elapsed >= intervalMs;
      const remainMin    = Math.max(0, Math.ceil((intervalMs - elapsed) / 60000));
      const stock        = c.stock || 0;
      const productName  = c.productName || '';
      const activeOwners = Object.values(c.budget||{}).filter(b=>!b.resigned).length || 1;

      html += `
      <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px;margin-bottom:10px">
        <div class="row" style="margin-bottom:8px">
          <span style="font-weight:700">${esc(c.name)}</span>
          ${allTraits ? '<span class="badge badge-gold">★ 全特性揃い（90分/回）</span>' : ''}
          <span class="spacer"></span>
          <span class="hint">在庫: <span class="din">${fmt(stock)}</span>個</span>
        </div>

        <div style="margin-bottom:10px">
          <label class="form-label">商品名を設定${c.ownerId !== S.uid ? '（起業者のみ変更可）' : ''}</label>
          <div class="row" style="gap:6px">
            <input class="input" id="pname-${c.id}" type="text"
                   value="${esc(productName)}" placeholder="例: りんご、手作りケーキ"
                   style="flex:1" ${c.ownerId !== S.uid ? 'disabled' : ''}/>
            ${c.ownerId === S.uid
              ? `<button class="btn btn-sm btn-primary"
                         onclick="W.setProductName('${c.id}')">設定</button>`
              : ''}
          </div>
          ${!productName ? `<div class="hint" style="color:#e67e22;margin-top:4px">
            ⚠ 商品名を設定してから生産・出品してください
          </div>` : ''}
        </div>

        <div style="margin-bottom:8px">
          <label class="form-label">生産原価（1個あたりのコスト・会社予算から引かれます）</label>
          <div class="row" style="gap:6px">
            <input class="input" id="cost-${c.id}" type="number" min="1"
                   value="${c.costPerUnit||1}" placeholder="原価(C/個)" style="width:110px"/>
            <span class="hint">COIN/個</span>
            <span class="hint">予算残高: <span class="din">${fmt(r(c.totalBudget||0))}</span> C</span>
          </div>
        </div>

        <div class="row" style="gap:8px">
          <button class="btn btn-primary"
                  onclick="W.produce('${c.id}')"
                  ${!canProduce || !productName ? 'disabled' : ''}>
            🏭 生産する（${activeOwners}個）
          </button>
          <span class="hint">
            ${!productName
              ? '商品名を設定してください'
              : canProduce
                ? '今すぐ生産できます！'
                : `次の生産まで ${remainMin} 分`}
          </span>
        </div>
        <div class="hint" style="margin-top:4px">
          生産間隔: ${allTraits ? '90分' : '120分'}/回 |
          生産量: 経営者${activeOwners}人分 |
          原価: 入力値 × ${activeOwners}個分（会社予算から）
        </div>

        ${stock > 0 ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e0ddd8">
          <label class="form-label">販売所に出品する</label>
          <div class="row" style="gap:6px">
            <input class="input" id="list-qty-${c.id}" type="number"
                   min="1" max="${stock}" placeholder="数量" style="width:80px"/>
            <input class="input" id="list-price-${c.id}" type="number"
                   min="1" placeholder="C/個" style="width:90px"/>
            <button class="btn btn-primary btn-sm"
                    onclick="W.listProduct('${c.id}')">出品</button>
            <span class="hint">在庫: ${fmt(stock)}個</span>
          </div>
          <div class="hint" style="margin-top:4px">売上は会社予算に入ります</div>
        </div>` : ''}

        ${Object.keys(c.listings||{}).length > 0 ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e0ddd8">
          <div class="hint" style="margin-bottom:6px">出品中の商品:</div>
          ${Object.entries(c.listings||{}).map(([lid, l]) => `
            <div class="row" style="margin-bottom:4px;gap:6px">
              <span class="hint">${fmt(l.qty)}個 × <span class="din">${fmt(l.pricePerUnit)}</span> C</span>
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
        会社を経営すると生産・出品ができます。<br>
        「会社」タブから起業または共同経営者として参加してください。
      </div>
    </div>`;
  }

  // ============================================================
  //  自分のアイテム所持欄
  // ============================================================
  const itemEntries = Object.entries(myItems).filter(([,v])=>v>0);
  if (itemEntries.length > 0) {
    html += `<div class="card">
      <div class="card-title">🎒 所持アイテム</div>
      ${itemEntries.map(([key, qty]) => {
        const coId  = key.replace('items_','');
        const co    = companies[coId];
        const pname = co?.productName || key;
        return `<div class="row" style="margin-bottom:6px">
          <span>${esc(pname)}</span><span class="spacer"></span>
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
          const isMyCompany = l.companyId &&
            companies[l.companyId]?.owners &&
            Object.prototype.hasOwnProperty.call(companies[l.companyId].owners, S.uid);
          return `
          <div style="border:1px solid #e0ddd8;border-radius:8px;
                      padding:10px 12px;margin-bottom:8px">
            <div class="row" style="margin-bottom:6px">
              <div>
                <div style="font-weight:700;font-size:13px">${esc(l.productName||'商品')}</div>
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
                      onclick="W.buyProduct('${l.id}','${esc(l.productName||'商品')}')">
                購入
              </button>
              <span class="hint">
                手持ち: <span class="din">${fmt(r(p.coins||0))}</span> C
              </span>
            </div>` : '<span class="hint">（自社商品）</span>'}
          </div>`;
        }).join('')}
  </div>`;

  return html;
}
