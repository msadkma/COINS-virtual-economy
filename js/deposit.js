// ============================================================
//  js/deposit.js  預金・定期預金操作（バグ修正版）
//  修正点: 追加入金時に現在の利息を確定してから新元本を計算する
// ============================================================
import { callApi, toast, fmt, r } from './firebase.js';
import { S, withSubmit } from './ui.js';
import { pushMeta } from './auth.js';

export async function doDeposit() {
  await withSubmit(async () => {
    const amt = r(parseFloat(document.getElementById('dep-in')?.value)||0);
    if (amt <= 0) { toast('金額を入力してください'); return; }
    const data = await callApi('deposit.php', { action:'deposit', amount:amt });
    toast(`${fmt(amt)} COINを預金しました`);
  });
}

export async function addDeposit() {
  await withSubmit(async () => {
    const amt = r(parseFloat(document.getElementById('dep-add')?.value)||0);
    if (amt <= 0) { toast('金額を入力してください'); return; }
    // ★ 修正: callApi内で現在の利息残高を計算してから追加するため
    //    「現在残高を確定 → それに追加額を足したものを新元本」として処理される
    const data = await callApi('deposit.php', { action:'add', amount:amt });
    toast(`${fmt(amt)} COINを追加預金しました（新元本: ${fmt(data.balance)} C）`);
  });
}

export async function withdrawDeposit() {
  await withSubmit(async () => {
    const data = await callApi('deposit.php', { action:'withdraw' });
    toast(`${fmt(data.returned)} COINを引き出しました`);
  });
}

export async function doTermDeposit() {
  await withSubmit(async () => {
    const amt  = r(parseFloat(document.getElementById('tdep-in')?.value)||0);
    const days = parseInt(document.getElementById('tdep-days')?.value)||7;
    if (amt <= 0) { toast('金額を入力してください'); return; }
    if (days < 7) { toast('7日以上を指定してください'); return; }
    await callApi('deposit.php', { action:'term_deposit', amount:amt, days });
    toast(`${fmt(amt)} COINを${days}日間定期預金しました`);
  });
}

export async function withdrawTermDeposit() {
  await withSubmit(async () => {
    const data = await callApi('deposit.php', { action:'term_withdraw' });
    toast(data.matured
      ? `定期満期！ ${fmt(data.returned)} COIN返還`
      : `期限前解約。元本 ${fmt(data.returned)} COIN返還`);
  });
}
