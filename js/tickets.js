// ============================================================
//  js/tickets.js  チケット→COIN変換（Cloud Functions版）
// ============================================================
import { callFn, toast } from './firebase.js';
import { withSubmit } from './ui.js';

export async function useTicket(type) {
  await withSubmit(async () => {
    const idMap = { normal: 'conv-n', rare: 'conv-r' };
    const count = Math.max(1, parseInt(document.getElementById(idMap[type])?.value) || 1);
    const data  = await callFn('useTicket', { type, count });
    toast(type === 'normal'
      ? `+${data.gain} COIN獲得！（チケット${data.used}枚使用）`
      : `★ レアチケット${data.used}枚使用！ +${data.gain} COIN！`);
  });
}
