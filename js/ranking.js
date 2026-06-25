// ============================================================
//  js/ranking.js  ランキング表示
// ============================================================
import { fmt, r, esc, avgAsset } from './firebase.js';
import { S } from './ui.js';

export function buildRanking() {
  const rows = Object.entries(S.playersMeta)
    .map(([uid, m]) => ({ uid, name: m.name||'???', rt: m.rankTotal||0, d: m.detail||{} }))
    .sort((a, b) => b.rt - a.rt);

  const medals = ['🥇','🥈','🥉'];
  const avg    = avgAsset(S.playersMeta);

  let html = `<div class="hint" style="margin-bottom:10px">
    全体平均資産: <span class="din">${fmt(r(avg))}</span> COIN |
    平均以下のプレイヤーには逆転ボーナス適用中
  </div>`;

  if (!rows.length) {
    return html + '<p style="color:#888;text-align:center;padding:30px">まだプレイヤーがいません</p>';
  }

  rows.forEach((row, i) => {
    const isMe   = row.uid === S.uid;
    const isUnder = row.rt < avg;
    const d      = row.d;
    html += `<div class="rank-row${isMe?' me':''}">
      <div class="rank-num">${medals[i] || (i+1)}</div>
      <div style="flex:1;min-width:0">
        <div class="row" style="margin-bottom:2px">
          <span style="font-weight:700">${esc(row.name)}</span>
          ${isMe   ? '<span class="badge badge-dark"   style="font-size:10px">あなた</span>' : ''}
          ${isUnder? '<span class="badge badge-orange" style="font-size:10px">📈 逆転中</span>' : ''}
        </div>
        <div class="hint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          手元:<span class="din">${fmt(d.coins||0)}</span>
          預金:<span class="din">${fmt(d.dep||0)}</span>
          定期:<span class="din">${fmt(d.tdep||0)}</span>
          ルーレット:<span class="din">${fmt(d.rbet||0)}</span>
          投資:<span class="din">${fmt(d.inv||0)}</span> C
        </div>
      </div>
      <div class="din" style="font-weight:700;font-size:17px;white-space:nowrap">${fmt(row.rt)} C</div>
    </div>`;
  });

  return html;
}
