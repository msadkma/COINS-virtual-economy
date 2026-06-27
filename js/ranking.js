// ============================================================
//  js/ranking.js  ランキング表示（1位補正ボーナス対応版）
// ============================================================
import { fmt, r, esc, avgAsset, rankTotal, calcInterest } from './firebase.js';

export function buildRanking(S) {
  const rows = Object.entries(S.playersMeta)
    .map(([uid, m]) => ({
      uid,
      name:    m.name    || '???',
      rt:      m.rankTotal || 0,
      d:       m.detail  || {},
    }))
    .sort((a, b) => b.rt - a.rt);

  const medals  = ['🥇','🥈','🥉'];
  const avg     = avgAsset(S.playersMeta);
  const first   = rows[0]?.rt || 0; // 1位の資産

  // 1位補正ボーナス計算
  // 計算式: floor( ((1位資産/(自分資産+1) - 1) / 100 + 1) * 自分資産 )
  function calcFirstBonus(myRt) {
    if (first <= 0 || myRt >= first) return 0;
    return Math.floor(((first / (myRt + 1) - 1) / 100) * myRt);
  }

  let html = `
  <div class="hint" style="margin-bottom:10px">
    全体平均資産: <span class="din">${fmt(r(avg))}</span> COIN |
    平均以下は逆転ボーナス適用中
  </div>`;

  if (!rows.length) {
    return html + '<p style="color:#888;text-align:center;padding:30px">まだプレイヤーがいません</p>';
  }

  const traitMap = {
    worker:    { label:'仕事人',   color:'#e74c3c', icon:'⚒' },
    manager:   { label:'経営者',   color:'#2980b9', icon:'👔' },
    negotiator:{ label:'交渉者',   color:'#f39c12', icon:'🤝' },
    balancer:  { label:'バランサー',color:'#27ae60', icon:'⚖' },
    accountant:{ label:'会計士',   color:'#8e44ad', icon:'📊' },
  };

  rows.forEach((row, i) => {
    const isMe    = row.uid === S.uid;
    const isUnder = row.rt  < avg;
    const d       = row.d;
    const bonus   = i > 0 ? calcFirstBonus(row.rt) : 0; // 1位以外に補正ボーナス
    // playersMeta から特性を取得
    const trait     = S.playersMeta[row.uid]?.trait || null;
    const traitInfo = trait ? traitMap[trait] : null;

    html += `<div class="rank-row${isMe?' me':''}">
      <div class="rank-num">${medals[i] || (i+1)}</div>
      <div style="flex:1;min-width:0">
        <div class="row" style="margin-bottom:2px">
          <span style="font-weight:700">${esc(row.name)}</span>
          ${traitInfo
            ? `<span style="font-size:14px;color:${traitInfo.color}"
                     title="${traitInfo.label}">${traitInfo.icon}</span>`
            : ''}
          ${isMe    ? '<span class="badge badge-dark"   style="font-size:10px">あなた</span>' : ''}
          ${isUnder ? '<span class="badge badge-orange" style="font-size:10px">📈 逆転中</span>' : ''}
          ${bonus>0 ? `<span class="badge badge-blue"   style="font-size:10px">+${fmt(bonus)} C/日</span>` : ''}
        </div>
        <div class="hint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          手元:<span class="din">${fmt(d.coins||0)}</span>
          預金:<span class="din">${fmt(d.dep||0)}</span>
          定期:<span class="din">${fmt(d.tdep||0)}</span>
          ルーレット:<span class="din">${fmt(d.rbet||0)}</span>
          投資:<span class="din">${fmt(d.inv||0)}</span> C
        </div>
      </div>
      <div class="din" style="font-weight:700;font-size:17px;white-space:nowrap">
        ${fmt(row.rt)} C
      </div>
    </div>`;
  });

  return html;
}
