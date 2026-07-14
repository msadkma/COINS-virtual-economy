// ============================================================
//  js/rules.js  ルール説明タブ
// ============================================================

export function buildRules() {
  return `
  <div class="card">
    <div class="card-title">📖 COINS架空市場 ルール一覧</div>
    <div class="hint" style="margin-bottom:12px">
      このゲームはCOINを増やすことを目指す仮想経済ゲームです。
    </div>
  </div>

  <div class="card">
    <div class="card-title">🎟 チケットシステム</div>
    <ul style="font-size:13px;line-height:2;padding-left:18px;color:#333">
      <li>チケットは<strong>60秒に1枚</strong>自動で付与されます（上限100枚）</li>
      <li>通常チケット1枚 = <strong>1 COIN</strong>に変換可能</li>
      <li>10%の確率で<strong>レアチケット</strong>（1〜10 COIN）が付与されます</li>
      <li>チケットは一括で変換できます</li>
    </ul>
  </div>

  <div class="card">
    <div class="card-title">🏦 預金システム</div>
    <ul style="font-size:13px;line-height:2;padding-left:18px;color:#333">
      <li>普通預金: <strong>利率1%/日（複利）</strong></li>
      <li>定期預金: <strong>利率2%/日（複利）</strong>・7日以上の期間指定</li>
      <li>定期預金を期限前に解約した場合は<strong>元本のみ返還</strong>（利息なし）</li>
      <li>普通預金への追加入金は残高に利息を計算してから元本に合算されます</li>
    </ul>
  </div>

  <div class="card">
    <div class="card-title">🎰 ルーレット</div>
    <ul style="font-size:13px;line-height:2;padding-left:18px;color:#333">
      <li>アメリカンルーレット（0・00含む38マス）</li>
      <li><strong>1時間ごと</strong>に開催されます</li>
      <li>数字に賭けると<strong>36倍</strong>、赤・黒・偶数・奇数・高・低は<strong>2倍</strong>、列・ダズンは<strong>3倍</strong></li>
      <li>他のプレイヤーがどこに賭けているか確認できます（🟡マーク）</li>
      <li>賭け上限は <strong>自分の総資産 × (1 − 自分の総資産/全体資産)</strong> です</li>
      <li>ルーレットへのベット額も賭け上限に含まれます</li>
    </ul>
  </div>

  <div class="card">
    <div class="card-title">📈 株式投資（Alpha / Beta / Gamma）</div>
    <ul style="font-size:13px;line-height:2;padding-left:18px;color:#333">
      <li>株価は<strong>12時間ごと</strong>に更新されます</li>
      <li>計算式: <code>直前株価 × (全体資産 + 購入額合計 − 売却額合計) / 全体資産</code></li>
      <li>株への投資額も<strong>賭け上限</strong>に含まれます</li>
      <li>週次で保有株数に応じた<strong>配当金</strong>（株価×保有数×1%）が支払われます</li>
    </ul>
  </div>

  <div class="card">
    <div class="card-title">🏢 会社・起業制度</div>
    <ul style="font-size:13px;line-height:2;padding-left:18px;color:#333">
      <li>株価と発行株数を指定して起業できます（費用: 株価×株数）</li>
      <li>起業費用はCOINが足りなくても<strong>借金として起業可能</strong>（残高がマイナスになります）</li>
      <li>会社には<strong>予算</strong>があり、経営者が自由に入金できます</li>
      <li>損益・配当はすべて<strong>会社予算</strong>から支払われます</li>
      <li>解散時は予算を各経営者の積立比率で分配します（赤字の場合は負担）</li>
      <li>会社株を購入した株主は<strong>週次で配当</strong>（株価×保有数×1%）を受け取れます</li>
      <li>配当は会社予算から支払われます</li>
      <li>解散時は株主の購入額を会社予算から補填します</li>
      <li>起業者のみが会社を解散できます</li>
      <li>起業者以外の経営者は<strong>退職</strong>できます（積立額は返還されません）</li>
      <li>共同経営者は起業者の招待制です</li>
      <li>全5種類の特性が経営者に揃うと生産速度ボーナスが付与されます</li>
    </ul>
  </div>

  <div class="card">
    <div class="card-title">🏆 ランキング基準</div>
    <ul style="font-size:13px;line-height:2;padding-left:18px;color:#333">
      <li>手元COIN + 預金元本 + 定期預金元本 + ルーレットベット額 + 投資コスト + 会社投資額</li>
      <li>（利息・評価益は含みません）</li>
    </ul>
  </div>

  <div class="card">
    <div class="card-title">📊 賭け上限</div>
    <ul style="font-size:13px;line-height:2;padding-left:18px;color:#333">
      <li>計算式: <code>自分の総資産 × (1 − 自分の総資産 / 全体資産)</code></li>
      <li>プレイヤーが1人の場合は総資産の50%が上限です</li>
      <li>ルーレットベット額 + 投資コストの合計がこの上限を超えることはできません</li>
    </ul>
  </div>

  <div class="card">
    <div class="card-title">📈 逆転ボーナス（デイリー）</div>
    <ul style="font-size:13px;line-height:2;padding-left:18px;color:#333">
      <li>総資産が全体平均を下回っているプレイヤーは毎日0時にボーナスを受け取ります</li>
      <li>ボーナス額: <code>(平均 − 自分の総資産) × 5%</code></li>
      <li>1位以外のプレイヤーには<strong>1位補正ボーナス</strong>も毎日配布されます</li>
      <li>1位補正計算式: <code>floor(((1位資産 / (自分資産+1) − 1) / 100 + 1) × 自分資産) − 自分資産</code></li>
    </ul>
  </div>

  <div class="card">
    <div class="card-title">⚡ 特性システム</div>
    <ul style="font-size:13px;line-height:2;padding-left:18px;color:#333">
      <li>登録時にランダムで5種類の特性のうち1つが付与されます</li>
      <li><span style="color:#e74c3c">⚒ 仕事人</span>: チケット生成速度が通常の1.5倍（40秒/枚）</li>
      <li><span style="color:#2980b9">👔 経営者</span>: 1位補正ボーナスを2倍受け取る</li>
      <li><span style="color:#f39c12">🤝 交渉者</span>: 株価への購入影響力が2倍</li>
      <li><span style="color:#27ae60">⚖ バランサー</span>: レアチケット確率+10%（10%→20%）</li>
      <li><span style="color:#8e44ad">📊 会計士</span>: 預金1.2%/日・定期2.4%/日</li>
      <li>特性の変更は<strong>2000 COIN</strong>で任意の特性に変更できます</li>
    </ul>
  </div>`;
}
