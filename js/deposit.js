// ============================================================
//  js/deposit.js  預金・定期預金操作（翌日反映版）
// ============================================================
import { callFn, toast, fmt, r } from './firebase.js';
import { withSubmit } from './ui.js';

export async function doDeposit() {
  await withSubmit(async () => {
    const amt = r(parseFloat(document.getElementById('dep-in')?.value)||0);
    if (amt <= 0) { toast('金額を入力してください'); return; }
    await callFn('deposit', { action:'deposit', amount:amt });
    toast(`${fmt(amt)} COINを預金しました`);
  });
}

export async function addDeposit() {
  await withSubmit(async () => {
    const amt = r(parseFloat(document.getElementById('dep-add')?.value)||0);
    if (amt <= 0) { toast('金額を入力してください'); return; }
    const data = await callFn('deposit', { action:'add', amount:amt });
    toast(`${fmt(amt)} COINを追加預金しました（新元本: ${fmt(data.balance)} C）`);
  });
}

export async function requestWithdrawDeposit() {
  await withSubmit(async () => {
    const data = await callFn('deposit', { action:'withdraw' });
    toast(`引き出しリクエストを受け付けました。翌日0時に ${fmt(data.scheduled ? '利息込みの残高' : '')} が引き出されます`);
  });
}

export async function cancelWithdrawDeposit() {
  await withSubmit(async () => {
    await callFn('deposit', { action:'cancel_withdraw' });
    toast('引き出しリクエストをキャンセルしました');
  });
}

// 後方互換エイリアス
export const withdrawDeposit = requestWithdrawDeposit;

export async function doTermDeposit() {
  await withSubmit(async () => {
    const amt  = r(parseFloat(document.getElementById('tdep-in')?.value)||0);
    const days = parseInt(document.getElementById('tdep-days')?.value)||7;
    if (amt <= 0) { toast('金額を入力してください'); return; }
    if (days < 7) { toast('7日以上を指定してください'); return; }
    await callFn('deposit', { action:'term_deposit', amount:amt, days });
    toast(`${fmt(amt)} COINを${days}日間定期預金しました`);
  });
}

export async function requestWithdrawTermDeposit() {
  await withSubmit(async () => {
    const data = await callFn('deposit', { action:'term_withdraw' });
    if (data.immediate) {
      toast(`✅ 満期！ ${fmt(data.returned)} COIN を受け取りました`);
    } else {
      toast(`引き出しリクエストを受け付けました。翌日0時に元本 ${fmt(data.returned)} COIN が返還されます`);
    }
  });
}

export async function cancelWithdrawTermDeposit() {
  await withSubmit(async () => {
    await callFn('deposit', { action:'cancel_term_withdraw' });
    toast('引き出しリクエストをキャンセルしました');
  });
}

// 後方互換エイリアス
export const withdrawTermDeposit = requestWithdrawTermDeposit;
