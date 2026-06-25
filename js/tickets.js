// ============================================================
//  js/tickets.js  チケット→COIN変換
// ============================================================
import { callApi, toast } from './firebase.js';
import { S, withSubmit } from './ui.js';
import { pushMeta } from './auth.js';

export async function useTicket(type) {
  await withSubmit(async () => {
    const idMap = { normal: 'conv-n', rare: 'conv-r' };
    const count = Math.max(1, parseInt(document.getElementById(idMap[type])?.value) || 1);
    const data  = await callApi('ticket.php', { type, count });
    toast(type === 'normal'
      ? `+${data.gain} COIN獲得！（チケット${data.used}枚使用）`
      : `★ レアチケット${data.used}枚使用！ +${data.gain} COIN！`);
  });
}
