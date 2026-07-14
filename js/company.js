// ============================================================
//  js/company.js  起業制度
// ============================================================
import { callFn, dbGet, dbSet, dbUpdate, auth, toast, fmt, r, esc,
         rankTotal } from './firebase.js';
import { S, withSubmit, renderPanel } from './ui.js';

// ============================================================
//  DB構造（companies/）
//  companies/{companyId}: {
//    id, name, ownerId, ownerName,
//    initialPrice,   // 株価設定（起業時）
//    totalShares,    // 総発行株数
//    circulatingShares, // 現在流通株数（売れた分だけ減る）
//    price,          // 現在の株価
//    history,        // 株価履歴
//    nextUpdate,     // 次回株価更新時刻
//    capital,        // 起業資金（ownersが分担）
//    owners: { uid: { name, capital, desiredPrice, trait } },
//    shareholders: { uid: qty },
//    desiredPrices: { uid: price },  // 経営者の希望株価
//    totalDividendPaid, // 累計配当
//    nextDividend,   // 次回配当時刻
//    pendingBonus,   // 未配布の売却ボーナス
//    createdAt,
//  }
// ============================================================

const TRAIT_LABELS = {
  worker:'仕事人', manager:'経営者', negotiator:'交渉者',
  balancer:'バランサー', accountant:'会計士',
};
const ALL_TRAITS = Object.keys(TRAIT_LABELS);

// ---- 全5種類の特性が揃っているか確認 ----
function hasAllTraits(owners, meta) {
  const traits = new Set();
  for (const uid of Object.keys(owners||{})) {
    const t = meta[uid]?.trait || null;
    if (t) traits.add(t);
  }
  return ALL_TRAITS.every(t => traits.has(t));
}

// ---- 起業に必要な資金 ----
export function calcFoundCost(price, shares) {
  return r(price * shares);
}

// ============================================================
//  起業UI構築
// ============================================================
export function buildCompany(p, S) {
  const companies = S.companies || {};
  const myCompanies = Object.values(companies).filter(c =>
    c.ownerId === S.uid || Object.keys(c.owners||{}).includes(S.uid)
  );
  const otherCompanies = Object.values(companies).filter(c =>
    c.ownerId !== S.uid && !Object.keys(c.owners||{}).includes(S.uid)
  );

  let html = '';

  // ---- 新規起業フォーム ----
  html += `<div class="card">
    <div class="card-title">🏢 新規起業</div>
    <div class="row" style="gap:6px;margin-bottom:8px">
      <div style="flex:1">
        <label class="form-label">会社名</label>
        <input class="input" id="co-name" type="text" placeholder="会社名" style="width:100%"/>
      </div>
    </div>
    <div class="row" style="gap:6px;margin-bottom:8px">
      <div style="flex:1">
        <label class="form-label">株価（COIN）</label>
        <input class="input" id="co-price" type="number" min="1" placeholder="例: 10"
               style="width:100%"/>
      </div>
      <div style="flex:1">
        <label class="form-label">発行株数</label>
        <input class="input" id="co-shares" type="number" min="1" placeholder="例: 100"
               style="width:100%"/>
      </div>
    </div>
    <div class="hint" style="margin-bottom:8px" id="co-cost-hint">
      必要資金: 株価 × 発行株数 COIN
    </div>
    <button class="btn btn-primary" onclick="W.foundCompany()">起業する</button>
    <div class="hint" style="margin-top:6px">
      手持ち: <span class="din">${fmt(r(p.coins||0))}</span> COIN |
      起業後の株価変動に逆数変動はありません
    </div>
  </div>`;

  // ---- 自分が経営する会社 ----
  if (myCompanies.length > 0) {
    html += `<div class="card-title" style="margin-bottom:8px">📋 経営中の会社</div>`;
    for (const c of myCompanies) {
      const isOwner    = c.ownerId === S.uid;
      const amOwner    = Object.keys(c.owners||{}).includes(S.uid);
      const allTraits  = hasAllTraits(c.owners, S.playersMeta);
      const chg        = c.history?.length > 1
        ? r(c.price) - r(c.history[c.history.length-2]) : 0;
      const pts        = (c.history||[c.price]).map((v,i,a) => {
        const mn=Math.min(...a),mx=Math.max(...a),rng=mx-mn||1;
        return `${i/(a.length-1||1)*200},${36-(v-mn)/rng*30}`;
      }).join(' ');
      const pendingInvites = Object.entries(c.invites||{})
        .filter(([,v])=>v.status==='pending');

      html += `<div class="card" style="border-color:${allTraits?'#f59e0b':'#e0ddd8'}">
        <div class="row" style="margin-bottom:4px">
          <span style="font-weight:800;font-size:14px">${esc(c.name)}</span>
          ${allTraits ? '<span class="badge badge-gold">★ 全特性揃い</span>' : ''}
          <span class="spacer"></span>
          <span class="din" style="font-weight:700;font-size:16px">${fmt(r(c.price))}</span>
          <span style="font-size:12px"> C</span>
          <span class="${chg>=0?'price-up':'price-down'} din" style="font-size:12px">
            ${chg>=0?'+':''}${fmt(chg)}
          </span>
        </div>
        <svg viewBox="0 0 200 40" style="width:100%;height:44px;display:block;margin-bottom:5px">
          <polyline points="${pts}" fill="none"
                    stroke="${chg>=0?'#1d9e75':'#c0392b'}" stroke-width="1.5"/>
        </svg>
        <div class="hint" style="margin-bottom:8px">
          流通株数: <span class="din">${fmt(c.circulatingShares||0)}</span> /
          総発行株数: <span class="din">${fmt(c.totalShares||0)}</span> |
          会社予算: <span class="din">${fmt(r(c.totalBudget||0))}</span> C |
          次回株価更新まで ${Math.max(0,Math.floor(((c.nextUpdate||0)-Date.now())/3600000))}時間
        </div>

        <div class="row" style="margin-bottom:6px;flex-wrap:wrap;gap:4px">
          ${Object.entries(c.owners||{}).map(([uid,o]) => {
            const t = S.playersMeta[uid]?.trait;
            const tInfo = t ? {
              worker:'⚒', manager:'👔', negotiator:'🤝',
              balancer:'⚖', accountant:'📊'
            }[t] : '';
            return `<span class="badge badge-blue">${esc(o.name)} ${tInfo}</span>`;
          }).join('')}
        </div>

        ${amOwner ? `
        <div style="margin-bottom:8px">
          <label class="form-label">会社予算に入金する</label>
          <div class="row" style="gap:6px">
            <input class="input" id="budget-${c.id}" type="number"
                   min="1" placeholder="入金額" style="width:120px"/>
            <button class="btn btn-primary"
                    onclick="W.depositToBudget('${c.id}')">入金</button>
            <span class="hint">自分の積立: <span class="din">${fmt(c.budget?.[S.uid]?.deposited||0)}</span> C</span>
          </div>
        </div>
        ` : ''}

        ${isOwner ? `
        <div style="margin-bottom:8px">
          <label class="form-label">共同経営者を招待（UIDまたはプレイヤー名）</label>
          <div class="row" style="gap:6px">
            <input class="input" id="inv-${c.id}" type="text"
                   placeholder="プレイヤー名" style="flex:1"/>
            <button class="btn" onclick="W.inviteCoOwner('${c.id}')">招待</button>
          </div>
        </div>
        ${pendingInvites.length > 0 ? `
        <div class="hint" style="margin-bottom:4px">招待中:</div>
        ${pendingInvites.map(([uid,inv]) =>
          `<div class="hint">${esc(inv.name)} — 承認待ち</div>`
        ).join('')}` : ''}
        ` : ''}

        <div class="row" style="gap:6px;margin-top:6px">
          ${isOwner ? `
            <button class="btn btn-danger btn-sm"
                    onclick="if(confirm('本当に解散しますか？株主への補填が発生します'))W.dissolveCompany('${c.id}')">
              会社を解散（起業者のみ）
            </button>` : `
            <button class="btn btn-sm"
                    onclick="if(confirm('退職しますか？預けたお金は返還されません'))W.resignFromCompany('${c.id}')">
              退職する
            </button>`}
        </div>
      </div>`;
    }
  }

  // ---- 投資可能な会社 ----
  if (otherCompanies.length > 0) {
    html += `<div class="card-title" style="margin-bottom:8px;margin-top:4px">
               🏦 投資可能な会社
             </div>`;
    for (const c of otherCompanies) {
      const myShares = c.shareholders?.[S.uid] || 0;
      const chg      = c.history?.length > 1
        ? r(c.price) - r(c.history[c.history.length-2]) : 0;
      const pts      = (c.history||[c.price]).map((v,i,a) => {
        const mn=Math.min(...a),mx=Math.max(...a),rng=mx-mn||1;
        return `${i/(a.length-1||1)*200},${36-(v-mn)/rng*30}`;
      }).join(' ');
      const pendingMyInvite = c.invites?.[S.uid];

      html += `<div class="card">
        <div class="row" style="margin-bottom:4px">
          <span style="font-weight:800;font-size:14px">${esc(c.name)}</span>
          <span class="spacer"></span>
          <span class="din" style="font-weight:700;font-size:16px">${fmt(r(c.price))}</span>
          <span style="font-size:12px"> C</span>
          <span class="${chg>=0?'price-up':'price-down'} din" style="font-size:12px">
            ${chg>=0?'+':''}${fmt(chg)}
          </span>
        </div>
        <svg viewBox="0 0 200 40" style="width:100%;height:44px;display:block;margin-bottom:5px">
          <polyline points="${pts}" fill="none"
                    stroke="${chg>=0?'#1d9e75':'#c0392b'}" stroke-width="1.5"/>
        </svg>
        <div class="hint" style="margin-bottom:8px">
          流通株数: <span class="din">${fmt(c.circulatingShares||0)}</span> |
          自分の保有: <span class="din">${fmt(myShares)}</span>株
          (≈<span class="din">${fmt(r(myShares*c.price))}</span> C) |
          配当: 購入額×1%/週
        </div>
        <div class="row" style="gap:6px">
          ${c.circulatingShares > 0 ? `
          <input class="input" id="cbuy-${c.id}" type="number" min="1"
                 max="${c.circulatingShares}" placeholder="買い株数" style="width:90px"/>
          <button class="btn btn-primary"
                  onclick="W.buyCompanyStock('${c.id}')">買う</button>
          ` : '<span class="hint">売り切れ</span>'}
          ${myShares > 0 ? `
          <input class="input" id="csell-${c.id}" type="number" min="1"
                 max="${myShares}" placeholder="売り株数" style="width:90px"/>
          <button class="btn btn-danger"
                  onclick="W.sellCompanyStock('${c.id}')">売る</button>
          ` : ''}
          <span class="hint">手持ち: <span class="din">${fmt(r(p.coins||0))}</span> C</span>
        </div>
        ${pendingMyInvite?.status === 'pending' ? `
        <div style="margin-top:8px;padding:8px;background:#eff6ff;border-radius:6px">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">
            共同経営者招待が届いています
          </div>
          <div class="hint" style="margin-bottom:6px">
            ${esc(c.ownerName)} から招待されました
          </div>
          <div class="row" style="gap:6px">
            <button class="btn btn-primary btn-sm"
                    onclick="W.acceptInvite('${c.id}')">承認</button>
            <button class="btn btn-sm"
                    onclick="W.rejectInvite('${c.id}')">拒否</button>
          </div>
        </div>` : ''}
      </div>`;
    }
  }

  if (!myCompanies.length && !otherCompanies.length) {
    html += `<div class="card">
      <p style="color:#888;text-align:center;padding:20px">
        まだ会社がありません。上のフォームから起業できます。
      </p>
    </div>`;
  }

  return html;
}

// ============================================================
//  起業処理
// ============================================================
export async function foundCompany() {
  await withSubmit(async () => {
    const name   = document.getElementById("co-name")?.value.trim();
    const price  = r(parseFloat(document.getElementById("co-price")?.value)||0);
    const shares = r(parseFloat(document.getElementById("co-shares")?.value)||0);
    if (!name)      { toast("会社名を入力してください"); return; }
    if (price  < 1) { toast("株価は1以上にしてください"); return; }
    if (shares < 1) { toast("発行株数は1以上にしてください"); return; }
    const data = await callFn("foundCompany", { name, price, shares });
    toast(`🏢 「${name}」を設立しました！ (-${fmt(data.cost)} COIN)`);
  });
}

// ============================================================
//  希望株価設定
// ============================================================
export async function depositToBudget(companyId) {
  await withSubmit(async () => {
    const amount = r(parseFloat(document.getElementById(`budget-${companyId}`)?.value)||0);
    if (amount <= 0) { toast('金額を入力してください'); return; }
    const c = S.companies?.[companyId];
    const data = await callFn('depositToBudget', { companyId, amount });
    toast(`${fmt(amount)} COINを会社予算に入金しました（予算合計: ${fmt(data.newTotal)} C）`);
  });
}

export async function resignFromCompany(companyId) {
  await withSubmit(async () => {
    const c = S.companies?.[companyId];
    await callFn('resignFromCompany', { companyId });
    toast(`「${esc(c?.name||'')}」を退職しました`);
  });
}

export async function inviteCoOwner(companyId) {
  await withSubmit(async () => {
    const targetName = document.getElementById(`inv-${companyId}`)?.value.trim();
    if (!targetName) { toast("プレイヤー名を入力してください"); return; }
    await callFn("inviteCoOwner", { companyId, targetName });
    toast(`${esc(targetName)} に招待を送りました`);
  });
}

export async function acceptInvite(companyId) {
  await withSubmit(async () => {
    await callFn("acceptInvite", { companyId });
    const c = S.companies?.[companyId];
    toast(`「${esc(c?.name||"")}」の共同経営者になりました`);
  });
}

export async function rejectInvite(companyId) {
  await withSubmit(async () => {
    await callFn("rejectInvite", { companyId });
    toast("招待を拒否しました");
  });
}

export async function buyCompanyStock(companyId) {
  await withSubmit(async () => {
    const qty = r(parseFloat(document.getElementById(`cbuy-${companyId}`)?.value)||0);
    if (qty <= 0) { toast("株数を入力してください"); return; }
    const c = S.companies?.[companyId];
    const data = await callFn("buyCompanyStock", { companyId, qty });
    toast(`${esc(c?.name||"")} ${qty}株を購入 (-${fmt(data.cost)} COIN)`);
  });
}

export async function sellCompanyStock(companyId) {
  await withSubmit(async () => {
    const qty = r(parseFloat(document.getElementById(`csell-${companyId}`)?.value)||0);
    if (qty <= 0) { toast("株数を入力してください"); return; }
    const c = S.companies?.[companyId];
    const data = await callFn("sellCompanyStock", { companyId, qty });
    toast(`${esc(c?.name||"")} ${qty}株を売却 (+${fmt(data.revenue)} COIN)`);
  });
}

export async function dissolveCompany(companyId) {
  await withSubmit(async () => {
    const c = S.companies?.[companyId];
    if (!c) { toast("会社が見つかりません"); return; }
    const data = await callFn("dissolveCompany", { companyId });
    toast(`「${esc(c.name)}」を解散しました。出資金 ${fmt(data.returned)} C が返還されました`);
  });
}

// ============================================================
//  株価更新・配当処理は Cloud Functions の scheduledCompanyUpdate が
//  自動実行するため、クライアント側では何もしない（互換性維持のため残す）
// ============================================================
export async function updateCompanyPrices() { /* no-op: Cloud Functionsが処理 */ }
export async function processDividends()    { /* no-op: Cloud Functionsが処理 */ }
