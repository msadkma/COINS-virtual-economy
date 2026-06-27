// ============================================================
//  js/roulette.js  ルーレット（演出修正版）
// ============================================================
import { callApi, toast, fmt, r, esc,
         isRed, isBlack, WHEEL_ORDER, calcBetLimit, currentBetUsage }
  from './firebase.js';
import { S, withSubmit, renderPanel } from './ui.js';

// ============================================================
//  ホイール描画（Canvas）
// ============================================================
const SLOT_COUNT = 38;

function slotColor(v) {
  return (v===0||v===37) ? '#1d9e75' : isRed(v) ? '#c0392b' : '#2c2c2c';
}
function slotLabel(v) { return v===37 ? '00' : String(v); }

function drawWheel(ctx, rotRad) {
  const cx=130, cy=130, outerR=128, innerR=36;
  const sa = (Math.PI*2) / SLOT_COUNT;
  ctx.clearRect(0, 0, 260, 260);
  // 外枠
  ctx.beginPath(); ctx.arc(cx,cy,outerR+2,0,Math.PI*2);
  ctx.fillStyle='#8B6914'; ctx.fill();
  // スロット
  for (let i=0; i<SLOT_COUNT; i++) {
    const s = rotRad + i*sa - Math.PI/2;
    const e = s + sa;
    const v = WHEEL_ORDER[i];
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,outerR,s,e); ctx.closePath();
    ctx.fillStyle = slotColor(v); ctx.fill();
    ctx.strokeStyle='#8B6914'; ctx.lineWidth=1; ctx.stroke();
    // 数字
    const mid = s + sa/2;
    const tr  = (outerR+innerR)/2;
    ctx.save();
    ctx.translate(cx+tr*Math.cos(mid), cy+tr*Math.sin(mid));
    ctx.rotate(mid + Math.PI/2);
    ctx.fillStyle='#fff';
    ctx.font='bold 8px system-ui';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(slotLabel(v), 0, 0);
    ctx.restore();
  }
  // 内側の円
  ctx.beginPath(); ctx.arc(cx,cy,innerR,0,Math.PI*2);
  ctx.fillStyle='#1a1a1a'; ctx.fill();
  ctx.strokeStyle='#8B6914'; ctx.lineWidth=3; ctx.stroke();
}

// ============================================================
//  スピンアニメーション
// ============================================================
export function spinWheel(targetVal) {
  return new Promise(resolve => {
    const modal    = document.getElementById('roulette-modal');
    const canvas   = document.getElementById('wheel-canvas');
    const resultEl = document.getElementById('modal-result');
    const subEl    = document.getElementById('modal-sub');
    const closeBtn = document.getElementById('modal-close-btn');
    if (!modal || !canvas) { resolve(); return; }
    const ctx = canvas.getContext('2d');
    const sa  = (Math.PI*2) / SLOT_COUNT;
    const idx = WHEEL_ORDER.indexOf(targetVal);
    // ターゲットがポインタ（上）に来るよう回転角を計算
    const targetRot  = -(idx * sa);
    const fullSpins  = (3 + Math.floor(Math.random()*3)) * Math.PI * 2;
    const endRot     = targetRot - fullSpins;
    modal.classList.remove('hidden');
    resultEl.textContent = '🎰 スピン中...';
    subEl.textContent    = '';
    closeBtn.classList.add('hidden');
    const dur = 4000;
    const t0  = performance.now();
    const ease = t => 1 - Math.pow(1-t, 3); // cubic ease-out
    function frame(now) {
      const t   = Math.min((now-t0)/dur, 1);
      const rot = endRot * ease(t);
      drawWheel(ctx, rot);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        drawWheel(ctx, endRot);
        const label = targetVal===37 ? '00' : String(targetVal);
        const color = (targetVal===0||targetVal===37) ? '#1d9e75'
                    : isRed(targetVal) ? '#e74c3c' : '#eee';
        resultEl.innerHTML = `<span style="color:${color};font-size:40px">${label}</span>`;
        closeBtn.classList.remove('hidden');
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

// ============================================================
//  他者ベット集計
// ============================================================
export function getOtherBets() {
  const rd = S.roulette; if (!rd?.bets) return {};
  const result = {};
  for (const [uid, bet] of Object.entries(rd.bets)) {
    if (uid === S.uid) continue;
    for (const [type, amt] of Object.entries(bet.bets||{}))
      result[type] = (result[type]||0) + r(amt);
  }
  return result;
}

// ============================================================
//  ベット確定
// ============================================================
export async function placeBet() {
  await withSubmit(async () => {
    const bets  = S.rbets;
    const total = r(Object.values(bets).reduce((a,b)=>a+b, 0));
    if (total <= 0) { toast('賭け箇所を選んでください'); return; }
    await callApi('roulette.php', { action:'bet', bets, total });
    S.rbets = {};
    toast(`${fmt(total)} COINをベット確定！`);
  });
}

// ============================================================
//  ルーレット開催処理（演出付き）
// ============================================================
export async function processRoulette() {
  try {
    const data = await callApi('roulette.php', { action:'process' });
    if (data.had_bet) {
      // 演出を表示してからスピン
      const subEl = document.getElementById('modal-sub');
      await spinWheel(data.result);
      if (subEl) {
        subEl.textContent = data.win > 0
          ? `🎉 +${fmt(data.win)} COIN 獲得！`
          : '残念... また次回！';
      }
    }
  } catch(e) {
    if (!e.message.includes('time') && !e.message.includes('processing'))
      console.error('roulette process:', e.message);
  }
}

// ============================================================
//  ベット操作
// ============================================================
export function toggleBet(type) {
  const amt = Math.max(1, r(parseFloat(document.getElementById('bet-amt')?.value)||1));
  if (S.rbets[type]) delete S.rbets[type]; else S.rbets[type] = amt;
  const p = S.players[S.uid]; if (p && !S.submitting) renderPanel(p);
}
export function clearBets() {
  S.rbets = {};
  const p = S.players[S.uid]; if (p && !S.submitting) renderPanel(p);
}

// ============================================================
//  ルーレットUI構築
// ============================================================
export function buildRoulette(p, S) {
  const rd       = S.roulette;
  const now      = S.now;
  const timeLeft = rd ? Math.max(0, rd.next-now) : 0;
  const pct      = Math.min(100, (1-timeLeft/3600000)*100);
  const mins     = Math.floor(timeLeft/60000);
  const secs     = Math.floor((timeLeft%60000)/1000);
  const myBet    = rd?.bets?.[S.uid];
  const bets     = S.rbets;
  const betTotal = r(Object.values(bets).reduce((a,b)=>a+b, 0));
  const otherBets= getOtherBets();
  const limit    = calcBetLimit(p, S.playersMeta);
  const usage    = currentBetUsage(p);
  const remain   = Math.max(0, limit-usage);
  const oDot     = type => otherBets[type]
    ? '<span class="other-bet-dot"></span>' : '';

  const numGrid = (() => {
    let h = '';
    for (let row=0; row<3; row++) {
      let cells = '';
      for (let col=0; col<12; col++) {
        const n   = col*3 + (3-row);
        const cls = isRed(n) ? 'r-red' : 'r-black';
        const sel = bets['num_'+n] ? 'sel' : '';
        const dot = otherBets['num_'+n]
          ? '<span class="other-bet-dot"></span>' : '';
        cells += `<div class="r-cell ${cls} ${sel}"
                       onclick="W._toggleBet('num_${n}')">${n}${dot}</div>`;
      }
      h += `<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:2px">${cells}</div>`;
    }
    return h;
  })();

  return `
  <div class="card">
    <div class="row" style="margin-bottom:6px">
      <span class="card-title" style="margin:0">🎰 アメリカンルーレット</span>
      <span class="spacer"></span>
      <span class="hint" id="r-timer">
        ${timeLeft<500 ? '🔴 開催中！' : `${mins}分${secs}秒後`}
      </span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" id="r-fill" style="width:${pct}%"></div>
    </div>
    ${rd?.last!=null
      ? `<div class="hint" style="margin-top:6px">前回の結果:
           <strong class="din">${rd.last===37?'00':rd.last}</strong></div>`
      : ''}
  </div>

  ${myBet ? `
  <div class="card">
    <div class="row">
      <span style="font-weight:700">📌 自分のベット済み</span>
      <span class="spacer"></span>
      <span class="badge badge-red din">${fmt(r(myBet.amount))} COIN</span>
    </div>
    <div class="hint" style="margin-top:4px">
      ${Object.entries(myBet.bets||{}).map(([k,v])=>`${k}:<span class="din">${r(v)}</span>C`).join(' | ')}
    </div>
  </div>` : ''}

  ${Object.keys(otherBets).length>0 ? `
  <div class="card">
    <div class="card-title" style="margin-bottom:6px">
      👥 他プレイヤーのベット <span class="hint">（🟡 = ベットあり）</span>
    </div>
    <div class="hint">
      ${Object.entries(otherBets).map(([k,v])=>`${k}: <span class="din">${fmt(v)}</span>C`).join(' | ')}
    </div>
  </div>` : ''}

  <div class="card">
    <div class="row" style="margin-bottom:4px">
      <span style="font-size:12px;color:#888">賭け可能残枠:
        <strong class="din" style="color:${remain<=0?'#c0392b':'#1a1a1a'}">
          ${fmt(remain)} COIN
        </strong>
      </span>
    </div>
    <div class="row" style="margin-bottom:8px">
      <span style="font-weight:700;font-size:13px">ベット額（箇所ごと）</span>
      <input class="input" id="bet-amt" type="number" min="1" value="1"
             style="width:70px;margin-left:4px"/>
      <span class="hint">COIN</span>
      <span class="spacer"></span>
      ${betTotal>0 ? `<span class="badge badge-red din">計 ${fmt(betTotal)} C</span>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:38px 1fr;gap:3px;margin-bottom:3px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <div class="r-cell r-green ${bets['num_0']?'sel':''}"
             onclick="W._toggleBet('num_0')"
             style="flex:1;display:flex;align-items:center;justify-content:center;position:relative">
          0${oDot('num_0')}
        </div>
        <div class="r-cell r-green ${bets['num_37']?'sel':''}"
             onclick="W._toggleBet('num_37')"
             style="flex:1;display:flex;align-items:center;justify-content:center;position:relative">
          00${oDot('num_37')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">${numGrid}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:4px">
      ${[['col1','列1'],['col2','列2'],['col3','列3']].map(([c,l]) =>
        `<div class="r-cell r-out ${bets[c]?'sel':''}"
              onclick="W._toggleBet('${c}')"
              style="position:relative">${l}(3:1)${oDot(c)}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:3px">
      ${[['doz1','1〜12'],['doz2','13〜24'],['doz3','25〜36']].map(([c,l]) =>
        `<div class="r-cell r-out ${bets[c]?'sel':''}"
              onclick="W._toggleBet('${c}')"
              style="position:relative">${l}(3:1)${oDot(c)}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px;margin-top:3px">
      ${[['low','1〜18'],['even','偶数'],['red','赤'],['black','黒'],['odd','奇数'],['high','19〜36']].map(([c,l]) =>
        `<div class="r-cell r-out ${bets[c]?'sel':''}"
              onclick="W._toggleBet('${c}')"
              style="position:relative">${l}${oDot(c)}</div>`).join('')}
    </div>

    <div class="row" style="margin-top:10px;gap:6px">
      <button class="btn btn-primary" onclick="W.placeBet()"
              ${betTotal<=0||remain<=0?'disabled':''}>
        ベット確定 (<span class="din">${fmt(betTotal)}</span> COIN)
      </button>
      <button class="btn" onclick="W._clearBets()">クリア</button>
      <span class="hint">手持ち: <span class="din">${fmt(r(p.coins||0))}</span> C</span>
    </div>
    <div class="hint" style="margin-top:4px">
      🟡 = 他プレイヤーがベット中 | 数字36倍/赤黒偶奇高低2倍/列ダズン3倍
    </div>
  </div>`;
}
