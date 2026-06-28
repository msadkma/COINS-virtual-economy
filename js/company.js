// ============================================================
//  js/company.js  起業制度
// ============================================================
import { dbGet, dbSet, dbUpdate, auth, toast, fmt, r, esc,
         rankTotal } from './firebase.js';
import { S, withSubmit, renderPanel } from './ui.js';
import { pushMeta } from './auth.js';

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
      const bonusRate  = allTraits ? 2 : 1;
      const myDesired  = c.desiredPrices?.[S.uid] ?? null;
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
          売却ボーナス: <span class="din">${bonusRate}</span> COIN/株 |
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
          <label class="form-label">希望株価を設定（現在価格の1/2〜2倍の範囲）</label>
          <div class="row" style="gap:6px">
            <input class="input" id="dp-${c.id}" type="number"
                   min="${r(c.price*0.5)}" max="${r(c.price*2)}"
                   value="${myDesired ?? r(c.price)}" style="width:120px"/>
            <button class="btn btn-primary"
                    onclick="W.setDesiredPrice('${c.id}')">設定</button>
            <span class="hint">
              現在の設定: ${myDesired!=null ? fmt(myDesired)+' C' : '未設定（本来の変動を採用）'}
            </span>
          </div>
          ${Object.entries(c.desiredPrices||{}).map(([uid,dp]) =>
            `<div class="hint" style="margin-top:3px">
              ${esc(c.owners[uid]?.name||'???')}: <span class="din">${fmt(dp)}</span> C
            </div>`
          ).join('')}
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
          <button class="btn btn-danger btn-sm"
                  onclick="W.dissolveCompany('${c.id}')">会社を解散</button>
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
    const name   = document.getElementById('co-name')?.value.trim();
    const price  = r(parseFloat(document.getElementById('co-price')?.value)||0);
    const shares = r(parseFloat(document.getElementById('co-shares')?.value)||0);
    if (!name)        { toast('会社名を入力してください'); return; }
    if (price  < 1)   { toast('株価は1以上にしてください'); return; }
    if (shares < 1)   { toast('発行株数は1以上にしてください'); return; }
    const cost = calcFoundCost(price, shares);
    const p    = await dbGet(`players/${S.uid}`);
    if (!p)           { toast('プレイヤーデータ取得失敗'); return; }
    if (cost > r(p.coins||0)) { toast(`${fmt(cost)} COINが必要です`); return; }
    const now  = Date.now();
    const id   = 'co_' + now + '_' + Math.random().toString(36).slice(2,7);
    const comp = {
      id, name,
      ownerId:            S.uid,
      ownerName:          p.name || S.pname,
      initialPrice:       price,
      totalShares:        shares,
      circulatingShares:  shares,
      price,
      history:            [price],
      nextUpdate:         now + 43200000,
      capital:            cost,
      owners:             { [S.uid]: { name: p.name||S.pname, capital: cost, trait: p.trait||null } },
      shareholders:       {},
      desiredPrices:      {},
      invites:            {},
      totalDividendPaid:  0,
      nextDividend:       now + 7*86400000,
      pendingBonus:       0,
      createdAt:          now,
    };
    await dbSet(`companies/${id}`, comp);
    await dbUpdate(`players/${S.uid}`, { coins: r((p.coins||0)-cost) });
    await pushMeta({ ...p, coins: r((p.coins||0)-cost) });
    toast(`🏢 「${name}」を設立しました！ (-${fmt(cost)} COIN)`);
  });
}

// ============================================================
//  希望株価設定
// ============================================================
export async function setDesiredPrice(companyId) {
  await withSubmit(async () => {
    const c    = await dbGet(`companies/${companyId}`);
    if (!c) { toast('会社が見つかりません'); return; }
    const dp   = r(parseFloat(document.getElementById(`dp-${companyId}`)?.value)||0);
    const min  = r(c.price * 0.5);
    const max  = r(c.price * 2);
    if (dp < min || dp > max) { toast(`希望株価は ${fmt(min)}〜${fmt(max)} COINの範囲で設定してください`); return; }
    await dbUpdate(`companies/${companyId}/desiredPrices`, { [S.uid]: dp });
    toast(`希望株価を ${fmt(dp)} C に設定しました`);
  });
}

// ============================================================
//  共同経営者招待
// ============================================================
export async function inviteCoOwner(companyId) {
  await withSubmit(async () => {
    const targetName = document.getElementById(`inv-${companyId}`)?.value.trim();
    if (!targetName) { toast('プレイヤー名を入力してください'); return; }
    // playersMeta から名前でUID検索
    const meta   = await dbGet('playersMeta') || {};
    const entry  = Object.entries(meta).find(([,m]) => m.name === targetName);
    if (!entry)  { toast('プレイヤーが見つかりません'); return; }
    const [targetUid, targetMeta] = entry;
    if (targetUid === S.uid) { toast('自分自身を招待できません'); return; }
    const c = await dbGet(`companies/${companyId}`);
    if (Object.keys(c.owners||{}).includes(targetUid)) {
      toast('すでに経営者です'); return;
    }
    await dbUpdate(`companies/${companyId}/invites`, {
      [targetUid]: { name: targetMeta.name||'???', status: 'pending', sentAt: Date.now() }
    });
    toast(`${targetName} に招待を送りました`);
  });
}

// ============================================================
//  招待承認・拒否
// ============================================================
export async function acceptInvite(companyId) {
  await withSubmit(async () => {
    const p = await dbGet(`players/${S.uid}`); if (!p) return;
    const c = await dbGet(`companies/${companyId}`); if (!c) return;
    // 共同経営者として追加
    await dbUpdate(`companies/${companyId}/owners`, {
      [S.uid]: { name: p.name||S.pname, capital: 0, trait: p.trait||null }
    });
    await dbUpdate(`companies/${companyId}/invites/${S.uid}`, { status: 'accepted' });
    toast(`「${c.name}」の共同経営者になりました`);
  });
}

export async function rejectInvite(companyId) {
  await withSubmit(async () => {
    await dbUpdate(`companies/${companyId}/invites/${S.uid}`, { status: 'rejected' });
    toast('招待を拒否しました');
  });
}

// ============================================================
//  会社株の購入（流通分のみ）
// ============================================================
export async function buyCompanyStock(companyId) {
  await withSubmit(async () => {
    const qty = r(parseFloat(document.getElementById(`cbuy-${companyId}`)?.value)||0);
    if (qty <= 0) { toast('株数を入力してください'); return; }
    const c = await dbGet(`companies/${companyId}`); if (!c) return;
    if ((c.circulatingShares||0) < qty) { toast('流通株数が不足しています'); return; }
    const p    = await dbGet(`players/${S.uid}`); if (!p) return;
    const cost = r(c.price * qty);
    if (cost > r(p.coins||0)) { toast('COINが不足しています'); return; }
    const newShares = r((c.shareholders?.[S.uid]||0) + qty);
    // 会社側: 流通株数を減らし、ボーナスを積算
    const bonusRate = hasAllTraits(c.owners, S.playersMeta) ? 2 : 1;
    await dbUpdate(`companies/${companyId}`, {
      circulatingShares: (c.circulatingShares||0) - qty,
      pendingBonus:      r((c.pendingBonus||0) + bonusRate * qty),
      [`shareholders/${S.uid}`]: newShares,
    });
    // プレイヤー: コイン減少・会社株保有を holdings に記録
    const holdings = { ...(p.holdings||{}) };
    holdings[`co_${companyId}`] = newShares;
    await dbUpdate(`players/${S.uid}`, {
      coins:        r((p.coins||0)-cost),
      holdings,
      investedCost: r((p.investedCost||0)+cost),
    });
    await pushMeta({ ...p, coins: r((p.coins||0)-cost),
                     holdings, investedCost: r((p.investedCost||0)+cost) });
    toast(`${esc(c.name)} ${qty}株を購入 (-${fmt(cost)} COIN)`);
  });
}

// ============================================================
//  会社株の売却
// ============================================================
export async function sellCompanyStock(companyId) {
  await withSubmit(async () => {
    const qty = r(parseFloat(document.getElementById(`csell-${companyId}`)?.value)||0);
    if (qty <= 0) { toast('株数を入力してください'); return; }
    const c = await dbGet(`companies/${companyId}`); if (!c) return;
    const p = await dbGet(`players/${S.uid}`); if (!p) return;
    const held = c.shareholders?.[S.uid] || 0;
    if (held < qty) { toast('保有数が不足しています'); return; }
    const rev  = r(c.price * qty);
    const newShares = held - qty;
    // 会社側: 流通株数を戻す（売却されたら市場に戻る）
    await dbUpdate(`companies/${companyId}`, {
      circulatingShares: (c.circulatingShares||0) + qty,
      [`shareholders/${S.uid}`]: newShares,
    });
    // プレイヤー: コイン増加
    const totalHeld  = Object.values(p.holdings||{}).reduce((a,b)=>a+b,0);
    const avgCost    = totalHeld > 0 ? (p.investedCost||0)/totalHeld : 0;
    const holdings   = { ...(p.holdings||{}) };
    holdings[`co_${companyId}`] = newShares;
    await dbUpdate(`players/${S.uid}`, {
      coins:        r((p.coins||0)+rev),
      holdings,
      investedCost: Math.max(0, r((p.investedCost||0)-r(avgCost*qty))),
    });
    await pushMeta({ ...p, coins: r((p.coins||0)+rev), holdings,
                     investedCost: Math.max(0,r((p.investedCost||0)-r(avgCost*qty))) });
    toast(`${esc(c.name)} ${qty}株を売却 (+${fmt(rev)} COIN)`);
  });
}

// ============================================================
//  会社解散
// ============================================================
export async function dissolveCompany(companyId) {
  await withSubmit(async () => {
    const c = await dbGet(`companies/${companyId}`); if (!c) return;
    if (c.ownerId !== S.uid) { toast('解散できるのは創業者のみです'); return; }
    const p = await dbGet(`players/${S.uid}`); if (!p) return;
    // 経営者の出資分を返還（均等分割）
    const ownerCount = Object.keys(c.owners||{}).length;
    const returnPerOwner = r((c.capital||0) / ownerCount);
    for (const ownerUid of Object.keys(c.owners||{})) {
      const op = await dbGet(`players/${ownerUid}`);
      if (op) {
        await dbUpdate(`players/${ownerUid}`, {
          coins: r((op.coins||0) + returnPerOwner)
        });
      }
    }
    await dbSet(`companies/${companyId}`, null);
    toast(`「${esc(c.name)}」を解散しました。出資金 ${fmt(returnPerOwner)} C が返還されました`);
  });
}

// ============================================================
//  株価更新（会社株）
// ============================================================
export async function updateCompanyPrices(playersMeta) {
  const companies = await dbGet('companies') || {};
  for (const [id, c] of Object.entries(companies)) {
    if (Date.now() < (c.nextUpdate||0)) continue;
    const cur     = c.price || 1;
    const circ    = c.circulatingShares || 1;
    const initial = c.capital || cur;
    // 株価変動 = 起業資金 / 流通株数 × ノイズ（逆数変動なし）
    const base    = initial / circ;
    const noise   = 1 + (Math.random()-0.5)*0.04;
    let   newPriceRaw = base * noise;
    // 希望株価の平均と本来の変動後の平均をとる
    const desired = Object.values(c.desiredPrices||{});
    if (desired.length > 0) {
      const avgDesired = desired.reduce((a,b)=>a+b,0) / desired.length;
      newPriceRaw = (newPriceRaw + avgDesired) / 2;
    }
    const newPrice = Math.max(1, r(newPriceRaw));
    const history  = [...(c.history||[cur]), newPrice].slice(-60);
    await dbUpdate(`companies/${id}`, {
      price:         newPrice,
      history,
      nextUpdate:    Date.now()+43200000,
      desiredPrices: {}, // 更新後は希望株価をリセット
    });
  }
}

// ============================================================
//  配当処理（週次）
// ============================================================
export async function processDividends() {
  const companies = await dbGet('companies') || {};
  for (const [id, c] of Object.entries(companies)) {
    if (Date.now() < (c.nextDividend||0)) continue;
    const shareholders = c.shareholders || {};
    let totalDividend  = 0;
    for (const [shUid, qty] of Object.entries(shareholders)) {
      if (qty <= 0) continue;
      // 配当 = 購入時の株価 × 株数 × 1%（購入コストは holdings から推定）
      const divAmount = Math.max(1, r(c.price * qty * 0.01));
      const sp = await dbGet(`players/${shUid}`);
      if (sp) {
        await dbUpdate(`players/${shUid}`, {
          coins: r((sp.coins||0) + divAmount)
        });
        totalDividend += divAmount;
      }
    }
    // 配当分を経営者からの支出として処理（経営者から均等徴収）
    const ownerUids  = Object.keys(c.owners||{});
    const perOwner   = ownerUids.length > 0 ? r(totalDividend/ownerUids.length) : 0;
    for (const ownerUid of ownerUids) {
      const op = await dbGet(`players/${ownerUid}`);
      if (op) {
        await dbUpdate(`players/${ownerUid}`, {
          coins: Math.max(0, r((op.coins||0) - perOwner))
        });
      }
    }
    // pendingBonusを経営者に分配
    if ((c.pendingBonus||0) > 0) {
      const bonusPerOwner = r((c.pendingBonus||0) / Math.max(1, ownerUids.length));
      for (const ownerUid of ownerUids) {
        const op = await dbGet(`players/${ownerUid}`);
        if (op) {
          await dbUpdate(`players/${ownerUid}`, {
            coins: r((op.coins||0) + bonusPerOwner)
          });
        }
      }
      if (bonusPerOwner > 0) toast(`🏢 売却ボーナス +${fmt(bonusPerOwner)} COIN！`);
    }
    await dbUpdate(`companies/${id}`, {
      nextDividend:      Date.now()+7*86400000,
      totalDividendPaid: r((c.totalDividendPaid||0)+totalDividend),
      pendingBonus:      0,
    });
    if (totalDividend > 0)
      toast(`💰 ${esc(c.name)} から配当 受け取り！`, 4000);
  }
}
