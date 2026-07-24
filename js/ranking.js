// ============================================================
//  js/ranking.js  ランキング表示（月間ランキング対応版）
// ============================================================
import { fmt, r, esc, avgAsset, rankTotal, callFn } from './firebase.js';
import { S } from './ui.js';

// 月間ランキングのキャッシュ
let monthlyCache = null;
let monthlyLoading = false;

export async function loadMonthlyRanking() {
  if (monthlyLoading) return;
  monthlyLoading = true;
  try {
    monthlyCache = await callFn('getMonthlyRanking', {});
  } catch(e) {
    console.error('monthly ranking:', e.message);
  } finally {
    monthlyLoading = false;
  }
}

export function buildRanking(S) {
  const rows = Object.entries(S.playersMeta)
    .map(([uid, m]) => ({
      uid,
      name: m.name    || '???',
      rt:   m.rankTotal || 0,
      d:    m.detail  || {},
    }))
    .sort((a, b) => b.rt - a.rt);

  const medals = ['🥇','🥈','🥉'];
  const avg    = avgAsset(S.playersMeta);
  const first  = rows[0]?.rt || 0;

  function calcFirstBonus(myRt) {
    if (first <= 0 || myRt >= first) return 0;
    const base = Math.floor(((first/(myRt+1)-1)/100+1)*myRt);
    return Math.max(0, base - myRt);
  }

  const traitMap = {
    worker:    { label:'仕事人',    color:'#e74c3c', icon:'⚒' },
    manager:   { label:'経営者',    color:'#2980b9', icon:'👔' },
    negotiator:{ label:'交渉者',    color:'#f39c12', icon:'🤝' },
    balancer:  { label:'バランサー',color:'#27ae60', icon:'⚖' },
    accountant:{ label:'会計士',    color:'#8e44ad', icon:'📊' },
  };

  // ---- タブ切り替え ----
  const tab = S.rankTab || 'total';

  let html = `
  <div class="row" style="gap:6px;margin-bottom:12px">
    <button class="btn ${tab==='total'?'btn-primary':''}"
            style="flex:1" onclick="W._setRankTab('total')">
      🏆 総合ランキング
    </button>
    <button class="btn ${tab==='monthly'?'btn-primary':''}"
            style="flex:1" onclick="W._setRankTab('monthly')">
      📅 月間ランキング
    </button>
  </div>`;

  // ============================================================
  //  総合ランキング
  // ============================================================
  if (tab === 'total') {
    html += `
    <div class="hint" style="margin-bottom:10px">
      全体平均資産: <span class="din">${fmt(r(avg))}</span> COIN |
      平均以下は逆転ボーナス適用中
    </div>`;

    if (!rows.length) {
      return html + '<p style="color:#888;text-align:center;padding:30px">まだプレイヤーがいません</p>';
    }

    rows.forEach((row, i) => {
      const isMe    = row.uid === S.uid;
      const isUnder = row.rt  < avg;
      const d       = row.d;
      const bonus   = i > 0 ? calcFirstBonus(row.rt) : 0;
      const trait   = S.playersMeta[row.uid]?.trait || null;
      const ti      = trait ? traitMap[trait] : null;

      html += `<div class="rank-row${isMe?' me':''}">
        <div class="rank-num">${medals[i]||(i+1)}</div>
        <div style="flex:1;min-width:0">
          <div class="row" style="margin-bottom:2px">
            <span style="font-weight:700">${esc(row.name)}</span>
            ${ti ? `<span style="font-size:14px;color:${ti.color}" title="${ti.label}">${ti.icon}</span>` : ''}
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
  }

  // ============================================================
  //  月間ランキング
  // ============================================================
  if (tab === 'monthly') {
    // 月キー（日本時間基準）
    const now     = Date.now();
    const jstDate = new Date(now + 9*60*60*1000);
    const monthKey = `${jstDate.getUTCFullYear()}年${jstDate.getUTCMonth()+1}月`;

    html += `
    <div class="hint" style="margin-bottom:10px">
      📅 ${monthKey}の月初からの資産増加ランキング<br>
      月初時点の資産と現在の資産の差分で順位が決まります
    </div>`;

    if (!monthlyCache) {
      // 未ロードの場合はロードをトリガーして読み込み中表示
      loadMonthlyRanking().then(() => {
        // ロード完了後に再描画
        if (typeof scheduleRender === 'function') scheduleRender();
      });
      html += `<div style="text-align:center;padding:30px;color:#888">
        📊 月間データを読み込み中...
      </div>`;
      return html;
    }

    const monthlyRows = (monthlyCache.results||[]).sort((a,b)=>b.gain-a.gain);
    if (!monthlyRows.length) {
      html += '<p style="color:#888;text-align:center;padding:30px">データがありません</p>';
      return html;
    }

    monthlyRows.forEach((row, i) => {
      const isMe    = row.uid === S.uid;
      const gainPos = row.gain >= 0;
      html += `<div class="rank-row${isMe?' me':''}">
        <div class="rank-num">${medals[i]||(i+1)}</div>
        <div style="flex:1;min-width:0">
          <div class="row" style="margin-bottom:2px">
            <span style="font-weight:700">${esc(row.name)}</span>
            ${isMe ? '<span class="badge badge-dark" style="font-size:10px">あなた</span>' : ''}
          </div>
          <div class="hint">
            月初: <span class="din">${fmt(row.startRankTotal)}</span> C →
            現在: <span class="din">${fmt(row.current)}</span> C
          </div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div class="din ${gainPos?'price-up':'price-down'}"
               style="font-weight:700;font-size:17px">
            ${gainPos?'+':''}${fmt(row.gain)} C
          </div>
        </div>
      </div>`;
    });

    html += `
    <div class="hint" style="margin-top:8px;text-align:center">
      <button class="btn btn-sm" onclick="W._reloadMonthly()">🔄 更新</button>
    </div>`;
  }

  return html;
}
