// ============================================================
//  js/deposit.js  預金・定期預金UI（翌日確定・受け取り対応版）
// ============================================================
import { callFn, fmt, r, esc } from './firebase.js';
import { S, withSubmit, toast } from './ui.js';

/**
 * 通常預金への預け入れ
 */
export async function depositCoins() {
  await withSubmit(async () => {
    const amtInput = document.getElementById('deposit-amount');
    const amount = parseInt(amtInput?.value) || 0;
    if (amount <= 0) { toast('正しい金額を入力してください'); return; }

    const data = await callFn('deposit', { action: 'deposit', amount });
    toast(`通常預金に ${fmt(amount)} COIN を預け入れました`);
    if (amtInput) amtInput.value = '';
  });
}

/**
 * 通常預金への追加入金
 */
export async function addDepositCoins() {
  await withSubmit(async () => {
    const amtInput = document.getElementById('deposit-add-amount');
    const amount = parseInt(amtInput?.value) || 0;
    if (amount <= 0) { toast('正しい金額を入力してください'); return; }

    const data = await callFn('deposit', { action: 'add', amount });
    toast(`通常預金に ${fmt(amount)} COIN を追加しました（利息が元本に組み込まれました）`);
    if (amtInput) amtInput.value = '';
  });
}

/**
 * 【修正】通常預金の引き出し申請（即時反映から「翌日確定予約」へ変更）
 */
export async function withdrawDeposit() {
  await withSubmit(async () => {
    // deposit.php の 'withdraw' アクションを呼び出す
    const data = await callFn('deposit', { action: 'withdraw' });
    
    if (data.status === 'reserved') {
      const availDate = new Date(data.availableAt);
      const timeStr = availDate.toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      toast(`【引き出し予約】確定しました。\n受け取り可能日時: ${timeStr} 以降`);
    } else {
      toast('引き出し申請に失敗しました');
    }
  });
}

/**
 * 【新設】翌日以降に予約されたコインを実際に受け取る関数
 */
export async function claimWithdrawal() {
  await withSubmit(async () => {
    try {
      // deposit.php の 'claim_withdraw' アクションを呼び出す
      const data = await callFn('deposit', { action: 'claim_withdraw' });
      toast(`【引き出し完了】予約されていた ${fmt(data.returned)} COIN を受け取りました！`);
    } catch (error) {
      // まだ24時間経っていない場合は、PHP側から「あと〇秒待ってください」等のエラーメッセージがそのまま error.message に入ります
      toast(`受け取り失敗: ${error.message}`);
    }
  });
}

/**
 * 定期預金の作成
 */
export async function createTermDeposit() {
  await withSubmit(async () => {
    const amtInput = document.getElementById('term-amount');
    const daysInput = document.getElementById('term-days');
    const amount = parseInt(amtInput?.value) || 0;
    const days = parseInt(daysInput?.value) || 7;

    if (amount <= 0) { toast('正しい金額を入力してください'); return; }
    if (days < 7) { toast('定期預金は7日以上で指定してください'); return; }

    await callFn('deposit', { action: 'term_deposit', amount, days });
    toast(`満期 ${days} 日の定期預金（元本: ${fmt(amount)} COIN）を開始しました`);
    if (amtInput) amtInput.value = '';
  });
}

/**
 * 定期預金の解約・引き出し
 */
export async function withdrawTermDeposit() {
  await withSubmit(async () => {
    const data = await callFn('deposit', { action: 'term_withdraw' });
    toast(`定期預金を解約し、${fmt(data.returned)} COIN を引き出しました`);
  });
}

/**
 * ---- 預金UI構築マウント関数 ----
 * 画面に通常預金、定期預金、そして「翌日引き出し確定枠」の情報をレンダリングします。
 */
export function buildDeposit(p, S) {
  const now = Date.now();
  
  // 通常預金データと利息計算（複利1%想定）
  const dep = p.deposit || null;
  let currentNormalBalance = 0;
  if (dep) {
    const elapsedDays = (now - dep.since) / 86400000;
    currentNormalBalance = Math.round(dep.principal * Math.pow(1.01, elapsedDays));
  }

  // 【新設】引き出し予約データの取得と状態判定
  const reservation = p.withdrawalReservation || null;
  let reservationHtml = '';
  if (reservation) {
    const availDate = new Date(reservation.availableAt);
    const timeStr = availDate.toLocaleString('ja-JP');
    const isAvailable = now >= reservation.availableAt;
    
    reservationHtml = `
      <div class="card" style="margin-top:15px; border-left: 4px solid #e67e22; background: #fffdf9;">
        <div class="card-body">
          <h4 style="color:#e67e22; margin-top:0;">⏳ 現在進行中の引き出し予約</h4>
          <div class="row" style="margin-bottom:8px;">
            <span>予約金額:</span><span class="spacer"></span>
            <span class="din" style="font-weight:700; color:#e67e22;">${fmt(reservation.amount)}</span> COIN
          </div>
          <div class="hint" style="margin-bottom:10px;">
            確定予定日時: <strong>${timeStr}</strong>
          </div>
          ${isAvailable 
            ? `<button class="btn btn-success" style="width:100%; font-weight:700;" onclick="W.claimWithdrawal()">💰 コインを財布に受け取る</button>`
            : `<button class="btn btn-secondary" style="width:100%; cursor:not-allowed;" disabled>⏳ まだ確定時間になっていません</button>`
          }
        </div>
      </div>
    `;
  }

  // 定期預金データ
  const td = p.termDeposit || null;
  let currentTermBalance = 0;
  let termInfoHtml = '<div class="hint">現在、定期預金はありません</div>';
  if (td) {
    const elapsedDays = (now - td.since) / 86400000;
    const isMatured = elapsedDays >= td.days;
    currentTermBalance = isMatured 
      ? Math.round(td.principal * Math.pow(1.02, elapsedDays))
      : Math.round(td.principal);

    const startDate = new Date(td.since).toLocaleDateString('ja-JP');
    termInfoHtml = `
      <div class="row hint">開始日: ${startDate} (${td.days}日間)</div>
      <div class="row" style="margin-top:5px; font-weight:700;">
        <span>現在の価値 (満期時+2%/日):</span><span class="spacer"></span>
        <span class="din">${fmt(currentTermBalance)}</span> COIN
      </div>
      <div class="hint" style="color: ${isMatured ? '#27ae60':'#c0392b'}; font-weight:bold; margin-top:5px;">
        ${isMatured ? '🎉 満期を達成しました！' : `⏳ 満期まであと ${Math.ceil(td.days - elapsedDays)} 日 (中途解約は利息がつきません)`}
      </div>
      <button class="btn btn-danger" style="width:100%; margin-top:10px;" onclick="W.withdrawTermDeposit()">
        ${isMatured ? '定期預金を引き出す' : '中途解約して元本を引き出す'}
      </button>
    `;
  }

  // HTML全体の組み立て
  let html = `
    <div class="deposit-container">
      <div class="card">
        <div class="card-header">🏦 通常預金 (利息: 複利 1% / 日)</div>
        <div class="card-body">
          <div class="row" style="font-size:18px; font-weight:700; margin-bottom:15px;">
            <span>現在の預金総額 (利息込):</span><span class="spacer"></span>
            <span class="din" style="color:#2980b9;">${fmt(currentNormalBalance)}</span> COIN
          </div>
          
          ${!dep ? `
            <div class="row" style="gap:6px; margin-bottom:10px;">
              <input class="input" id="deposit-amount" type="number" min="1" placeholder="新規預入額" style="flex:1"/>
              <button class="btn btn-primary" onclick="W.depositCoins()">新規預入</button>
            </div>
          ` : `
            <div class="row" style="gap:6px; margin-bottom:15px;">
              <input class="input" id="deposit-add-amount" type="number" min="1" placeholder="追加預入額" style="flex:1"/>
              <button class="btn btn-primary" onclick="W.addDepositCoins()">追加入金</button>
            </div>
            <button class="btn btn-warning" style="width:100%; font-weight:700;" onclick="W.withdrawDeposit()">
              📤 預金の引き出し申請を行う (翌日確定払い)
            </button>
          `}
        </div>
      </div>

      ${reservationHtml}

      <div class="card" style="margin-top:20px;">
        <div class="card-header">🔒 定期預金 (満期時利息: 複利 2% / 日)</div>
        <div class="card-body">
          ${!td ? `
            <div class="row" style="gap:6px; margin-bottom:8px;">
              <input class="input" id="term-amount" type="number" min="1" placeholder="預入額" style="flex:2"/>
              <input class="input" id="term-days" type="number" min="7" value="7" placeholder="日数" style="flex:1"/>
            </div>
            <button class="btn btn-dark" style="width:100%;" onclick="W.createTermDeposit()">定期預金を開始する (最低7日)</button>
          ` : termInfoHtml}
        </div>
      </div>
    </div>
  `;

  return html;
}
