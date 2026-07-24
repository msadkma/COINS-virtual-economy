// ============================================================
//  js/rules.js  ルール説明タブ（初心者向け完全解説版）
// ============================================================

export function buildRules() {
  return `
  <div class="card" style="background:linear-gradient(135deg,#1d9e75 0%,#0f6e50 100%);color:#fff">
    <div style="font-size:22px;font-weight:900;margin-bottom:6px">📖 COINS架空市場 完全ガイド</div>
    <div style="font-size:13px;opacity:0.9;line-height:1.7">
      このゲームは、チケットを集めてCOINに変え、預金・ルーレット・投資・会社経営などで
      資産を増やしていく<strong>仮想経済ゲーム</strong>です。<br>
      まずはこのガイドを読んで、ゲームの全体像を把握しましょう。
    </div>
  </div>

  <!-- 目次 -->
  <div class="card">
    <div class="card-title">📋 もくじ</div>
    <ol style="font-size:13px;line-height:2.2;padding-left:20px;color:#333">
      <li>ゲームの目標と基本の流れ</li>
      <li>チケットシステム</li>
      <li>COIN（通貨）について</li>
      <li>預金システム</li>
      <li>ルーレット</li>
      <li>株式投資（Alpha / Beta / Gamma）</li>
      <li>賭け上限</li>
      <li>ランキング</li>
      <li>逆転ボーナス・1位補正ボーナス</li>
      <li>特性システム</li>
      <li>会社・起業制度</li>
      <li>生産・販売所</li>
      <li>アイテム一覧と使い方</li>
    </ol>
  </div>

  <!-- 1. ゲームの目標と基本の流れ -->
  <div class="card">
    <div class="card-title">① ゲームの目標と基本の流れ</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      ゲームの目標は<strong>ランキング上位を目指してCOINを増やすこと</strong>です。<br>
      ただし単純に貯めるだけでなく、預金・投資・会社経営など複数の方法を組み合わせて
      戦略的に資産を増やすことが重要です。
    </p>
    <div style="background:#f0fdf4;border-left:4px solid #1d9e75;padding:10px 14px;
                border-radius:0 6px 6px 0;font-size:13px;line-height:1.8">
      <strong>基本の流れ</strong><br>
      1. チケットが自動で溜まる → COINに変換<br>
      2. COINを預金・ルーレット・投資・会社などに活用<br>
      3. 資産を増やしてランキング上位を目指す
    </div>
  </div>

  <!-- 2. チケットシステム -->
  <div class="card">
    <div class="card-title">② チケットシステム</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      チケットはゲームの基本収入源です。<strong>ログインしているだけで自動的に付与</strong>されます。
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div style="background:#fff;border:1px solid #e0ddd8;border-radius:8px;padding:10px">
        <div style="font-weight:700;margin-bottom:4px">🎟 通常チケット</div>
        <div style="font-size:12px;color:#555;line-height:1.7">
          ・<strong>60秒に1枚</strong>自動付与<br>
          ・1枚 = <strong>1 COIN</strong>に変換可能<br>
          ・上限: 合計100枚
        </div>
      </div>
      <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:10px">
        <div style="font-weight:700;margin-bottom:4px">⭐ レアチケット</div>
        <div style="font-size:12px;color:#555;line-height:1.7">
          ・通常付与の<strong>10%の確率</strong>で出現<br>
          ・1枚 = <strong>1〜10 COIN</strong>（ランダム）<br>
          ・上限: 通常と合わせて100枚
        </div>
      </div>
    </div>
    <div style="background:#eff6ff;border-radius:6px;padding:10px 12px;font-size:12px;color:#1d4ed8">
      💡 チケットは上限100枚を超えると付与されません。こまめに変換しましょう。
    </div>
  </div>

  <!-- 3. COIN -->
  <div class="card">
    <div class="card-title">③ COIN（通貨）について</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:8px">
      COINはこのゲームの唯一の通貨です。チケット変換・預金利息・ルーレット当選・
      株の売却・配当など、あらゆる方法で増やせます。
    </p>
    <div style="background:#fff0f0;border-left:4px solid #e74c3c;padding:10px 14px;
                border-radius:0 6px 6px 0;font-size:12px;line-height:1.7;color:#991b1b">
      ⚠ 会社経営での損失などにより、COINの残高が<strong>マイナスになる場合があります（借金状態）</strong>。
      借金状態では新たな出費に注意が必要です。ただし起業時は残高不足では起業できません。
    </div>
  </div>

  <!-- 4. 預金システム -->
  <div class="card">
    <div class="card-title">④ 預金システム</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      COINを預けることで<strong>毎日利息が付きます（複利）</strong>。
      手元に置くより効率よく増やせる安定した方法です。
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div style="background:#fff;border:1px solid #e0ddd8;border-radius:8px;padding:10px">
        <div style="font-weight:700;color:#2980b9;margin-bottom:4px">🏦 普通預金</div>
        <div style="font-size:12px;color:#555;line-height:1.8">
          ・利率: <strong>1%/日（複利）</strong><br>
          ・追加入金可能<br>
          ・引き出しリクエスト翌日に反映<br>
          ・いつでも引き出し可能
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e0ddd8;border-radius:8px;padding:10px">
        <div style="font-weight:700;color:#8e44ad;margin-bottom:4px">📅 定期預金</div>
        <div style="font-size:12px;color:#555;line-height:1.8">
          ・利率: <strong>2%/日（複利）</strong><br>
          ・最低7日間の期間指定<br>
          ・引き出しリクエスト翌日に反映<br>
          ・期限前解約は<strong>元本のみ返還</strong>（利息なし）
        </div>
      </div>
    </div>
    <div style="background:#eff6ff;border-radius:6px;padding:10px 12px;font-size:12px;color:#1d4ed8">
      💡 引き出しは「リクエストした翌日の0時」に実際の返還が行われます。
      リクエスト後にキャンセルすることも可能です。
    </div>
  </div>

  <!-- 5. ルーレット -->
  <div class="card">
    <div class="card-title">⑤ ルーレット</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      <strong>1時間ごとに自動開催</strong>されるアメリカンルーレット（0・00を含む38マス）です。
      開催前にベットしておくと、結果に応じてCOINを獲得できます。
    </p>
    <div style="font-size:13px;font-weight:700;margin-bottom:6px">ベットの種類と倍率</div>
    <table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:12px">
      <tr style="background:#f0f0f0">
        <th style="padding:6px 8px;text-align:left;border-radius:4px 0 0 0">ベット種類</th>
        <th style="padding:6px 8px;text-align:center">倍率</th>
        <th style="padding:6px 8px;text-align:left;border-radius:0 4px 0 0">説明</th>
      </tr>
      <tr style="border-bottom:1px solid #e0ddd8">
        <td style="padding:6px 8px">数字（0〜36, 00）</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:#e74c3c">×36</td>
        <td style="padding:6px 8px">1つの数字に賭ける</td>
      </tr>
      <tr style="border-bottom:1px solid #e0ddd8">
        <td style="padding:6px 8px">赤 / 黒</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:#e74c3c">×2</td>
        <td style="padding:6px 8px">赤か黒かを予想</td>
      </tr>
      <tr style="border-bottom:1px solid #e0ddd8">
        <td style="padding:6px 8px">偶数 / 奇数</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:#e74c3c">×2</td>
        <td style="padding:6px 8px">偶数か奇数かを予想</td>
      </tr>
      <tr style="border-bottom:1px solid #e0ddd8">
        <td style="padding:6px 8px">低（1〜18）/ 高（19〜36）</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:#e74c3c">×2</td>
        <td style="padding:6px 8px">前半か後半かを予想</td>
      </tr>
      <tr style="border-bottom:1px solid #e0ddd8">
        <td style="padding:6px 8px">列（Column）</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:#e74c3c">×3</td>
        <td style="padding:6px 8px">3列のどれかを予想</td>
      </tr>
      <tr>
        <td style="padding:6px 8px">ダズン（1〜12, 13〜24, 25〜36）</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:#e74c3c">×3</td>
        <td style="padding:6px 8px">12個ずつのグループを予想</td>
      </tr>
    </table>
    <div style="background:#eff6ff;border-radius:6px;padding:10px 12px;font-size:12px;color:#1d4ed8">
      💡 0と00が出た場合、赤・黒・偶数・奇数・高・低はすべて外れになります。<br>
      他のプレイヤーがどこに賭けているか画面で確認できます（参考にしましょう）。
    </div>
  </div>

  <!-- 6. 株式投資 -->
  <div class="card">
    <div class="card-title">⑥ 株式投資（Alpha / Beta / Gamma）</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      3つの銘柄（Alpha・Beta・Gamma）の株を売買できます。
      株価は<strong>全プレイヤーの売買状況によって変動</strong>します。
    </p>
    <div style="background:#f9f8f6;border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">📊 株価の変動の仕組み</div>
      <div style="font-size:12px;color:#555;line-height:1.9">
        株価は12時間ごとに以下の計算式で更新されます：<br>
        <code style="background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #e0ddd8">
          新株価 = 直前株価 × (全体資産 + 購入額合計 − 売却額合計) / 全体資産
        </code><br>
        <br>
        つまり<strong>みんなが買えば株価が上がり、売れば下がります</strong>。
      </div>
    </div>
    <div style="background:#fff;border:1px solid #e0ddd8;border-radius:8px;padding:10px;margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">💰 配当金</div>
      <div style="font-size:12px;color:#555;line-height:1.7">
        週に1回、保有株に応じた配当金が自動で支払われます。<br>
        配当額 = 株価 × 保有株数 × 1%
      </div>
    </div>
    <div style="background:#fff0f0;border-radius:6px;padding:10px 12px;font-size:12px;color:#991b1b">
      ⚠ 株への投資額はルーレットのベット額と合算して「賭け上限」に含まれます。
    </div>
  </div>

  <!-- 7. 賭け上限 -->
  <div class="card">
    <div class="card-title">⑦ 賭け上限</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      ルーレットのベット額と株への投資額の<strong>合計には上限があります</strong>。
      資産の多いプレイヤーほど上限が小さくなる仕組みで、
      1人が大量に賭けて資産を独占することを防いでいます。
    </p>
    <div style="background:#f9f8f6;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">計算式</div>
      <code style="font-size:12px;background:#fff;padding:4px 8px;border-radius:4px;
                    border:1px solid #e0ddd8;display:block;line-height:1.8">
        賭け上限 = 自分の総資産 × (1 − 自分の総資産 / 全体の総資産)
      </code>
      <div style="font-size:12px;color:#888;margin-top:6px">
        ※ プレイヤーが自分1人だけのとき: 総資産の50%が上限
      </div>
    </div>
    <div style="background:#eff6ff;border-radius:6px;padding:10px 12px;font-size:12px;color:#1d4ed8">
      💡 例: 全体資産1000 COINのうち自分が500 COINなら、上限は 500 × (1 − 0.5) = 250 COIN
    </div>
  </div>

  <!-- 8. ランキング -->
  <div class="card">
    <div class="card-title">⑧ ランキング</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      ランキングの順位は以下の合計で決まります。
      利息や評価益は含まれないため、
      <strong>実際の表示資産とランキング上の資産は異なる場合があります</strong>。
    </p>
    <div style="background:#f9f8f6;border-radius:8px;padding:12px">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">ランキングスコアの内訳</div>
      <div style="font-size:12px;color:#555;line-height:2">
        ✅ 手元のCOIN（残高）<br>
        ✅ 普通預金の元本<br>
        ✅ 定期預金の元本<br>
        ✅ ルーレットにベット中のCOIN<br>
        ✅ 株への投資コスト<br>
        ✅ 会社への出資額<br>
        ❌ 預金利息（含まない）<br>
        ❌ 株の含み益（含まない）
      </div>
    </div>
  </div>

  <!-- 9. 逆転ボーナス -->
  <div class="card">
    <div class="card-title">⑨ 逆転ボーナス・1位補正ボーナス</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      資産の少ないプレイヤーが追いつきやすくなる仕組みが2つあります。
      どちらも<strong>毎日0時に自動で付与</strong>されます。
    </p>
    <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;color:#1d9e75;margin-bottom:6px">
        📈 逆転ボーナス（全体平均より資産が少ない人が対象）
      </div>
      <div style="font-size:12px;color:#555;line-height:1.8">
        ボーナス額 = (全体平均 − 自分の資産) × 5%<br>
        例: 平均が1000 COINで自分が600 COINなら、(1000 - 600) × 5% = <strong>20 COIN</strong>
      </div>
    </div>
    <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px">
      <div style="font-weight:700;font-size:13px;color:#2980b9;margin-bottom:6px">
        👑 1位補正ボーナス（1位以外の全員が対象）
      </div>
      <div style="font-size:12px;color:#555;line-height:1.8">
        1位との差が大きいほど多くのボーナスが付きます。<br>
        計算式: floor(((1位資産 ÷ (自分の資産+1) − 1) ÷ 100 + 1) × 自分の資産) − 自分の資産<br>
        <span style="color:#888">※ 「経営者」特性持ちはこのボーナスが2倍になります</span>
      </div>
    </div>
  </div>

  <!-- 10. 特性システム -->
  <div class="card">
    <div class="card-title">⑩ 特性システム</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:12px">
      登録時に<strong>5種類の特性のうち1つがランダムに付与</strong>されます。
      特性によって得意な戦略が変わります。2000 COINで任意の特性に変更できます。
    </p>
    <div style="display:grid;gap:8px">
      <div style="border:2px solid #e74c3c;border-radius:8px;padding:10px">
        <div style="font-weight:700;color:#e74c3c;margin-bottom:3px">⚒ 仕事人</div>
        <div style="font-size:12px;color:#555;line-height:1.6">
          チケットの生成速度が<strong>通常の1.5倍</strong>（60秒→40秒/枚）<br>
          地道にチケットを積み上げたい人向け
        </div>
      </div>
      <div style="border:2px solid #2980b9;border-radius:8px;padding:10px">
        <div style="font-weight:700;color:#2980b9;margin-bottom:3px">👔 経営者</div>
        <div style="font-size:12px;color:#555;line-height:1.6">
          毎日の<strong>1位補正ボーナスが2倍</strong>になる<br>
          資産が少ないほど効果が大きい逆転型の特性
        </div>
      </div>
      <div style="border:2px solid #f39c12;border-radius:8px;padding:10px">
        <div style="font-weight:700;color:#f39c12;margin-bottom:3px">🤝 交渉者</div>
        <div style="font-size:12px;color:#555;line-height:1.6">
          株を購入したときの<strong>株価への影響力が2倍</strong>になる<br>
          少ない資金で株価を大きく動かせる
        </div>
      </div>
      <div style="border:2px solid #27ae60;border-radius:8px;padding:10px">
        <div style="font-weight:700;color:#27ae60;margin-bottom:3px">⚖ バランサー</div>
        <div style="font-size:12px;color:#555;line-height:1.6">
          レアチケットの出現率が<strong>通常10%→20%</strong>になる<br>
          チケット変換でCOINを多く稼ぎたい人向け
        </div>
      </div>
      <div style="border:2px solid #8e44ad;border-radius:8px;padding:10px">
        <div style="font-weight:700;color:#8e44ad;margin-bottom:3px">📊 会計士</div>
        <div style="font-size:12px;color:#555;line-height:1.6">
          普通預金<strong>1.2%/日・定期預金2.4%/日</strong>（通常の1.2倍）<br>
          安定して資産を増やしたい人向け
        </div>
      </div>
    </div>
  </div>

  <!-- 11. 会社・起業制度 -->
  <div class="card">
    <div class="card-title">⑪ 会社・起業制度</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      COINを使って会社を設立し、株を発行して他のプレイヤーに購入してもらうことで
      資金を集め、生産・販売で利益を得られるシステムです。
    </p>

    <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">🏢 起業の流れ</div>
      <div style="font-size:12px;color:#555;line-height:2">
        1. 「会社」タブから株価と発行株数を設定して起業<br>
        &nbsp;&nbsp;&nbsp;費用 = 株価 × 発行株数（残高不足の場合は起業不可）<br>
        2. 他のプレイヤーが株を購入すると購入代金が会社予算に入る<br>
        3. 会社予算で生産・販売を行い利益を得る<br>
        4. 週次で株主に配当金を支払う（株価 × 保有数 × 1%）
      </div>
    </div>

    <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">💰 会社予算の仕組み</div>
      <div style="font-size:12px;color:#555;line-height:1.9">
        会社には「予算」があり、経営者は自由に入金できます。<br>
        <strong>損益はすべて会社予算で処理</strong>されます（個人COINには直接影響しません）。<br>
        解散時は各経営者の積立比率に応じて残予算を分配します。<br>
        赤字の場合は積立比率に応じて各経営者が負担します。
      </div>
    </div>

    <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">👥 共同経営者</div>
      <div style="font-size:12px;color:#555;line-height:1.9">
        起業者が他のプレイヤーを招待して共同経営できます。<br>
        共同経営者も会社予算への入金・生産が可能になります。<br>
        <strong>退職した場合、積立したお金は返ってきません</strong>（退職後は損益分配対象外）。
      </div>
    </div>

    <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">📊 株価の決まり方</div>
      <div style="font-size:12px;color:#555;line-height:1.9">
        会社株価 = 会社予算 ÷ 流通株数 × 変動係数（12時間ごとに更新）<br>
        予算が増えると株価が上がり、配当支払いや生産コストで予算が減ると下がります。
      </div>
    </div>

    <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">🔴 会社解散</div>
      <div style="font-size:12px;color:#555;line-height:1.9">
        解散できるのは<strong>起業者のみ</strong>です。<br>
        解散時の流れ:<br>
        1. 株主に購入額を補填（会社予算から支出）<br>
        2. 残った予算を積立比率で分配（マイナスの場合は各経営者が負担）<br>
        <strong>簡単に解散できないよう、株主補填コストが発生します。</strong>
      </div>
    </div>
  </div>

  <!-- 12. 生産・販売所 -->
  <div class="card">
    <div class="card-title">⑫ 生産・販売所</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      会社を経営するとアイテムを生産して販売所に出品できます。
      生産したアイテムを他のプレイヤーが購入し、売上が会社予算に入ります。
    </p>

    <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">🏭 生産の仕組み</div>
      <div style="font-size:12px;color:#555;line-height:1.9">
        ・生産ボタンを押すたびに1回分生産される（手動操作）<br>
        ・生産間隔: <strong>通常 120分/回</strong>、全特性揃いの会社は <strong>90分/回</strong><br>
        ・生産量: <strong>アクティブな経営者の人数分</strong>（人数が多いほど速い）<br>
        ・生産コストは会社予算から引かれる
      </div>
    </div>

    <div style="border:1px solid #e0ddd8;border-radius:8px;padding:12px">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">📦 生産できる4種類のアイテム</div>
      <div style="display:grid;gap:6px">
        <div style="background:#f9f8f6;border-radius:6px;padding:8px 10px;font-size:12px">
          <strong>📄 定期預金即引出チケット</strong>（原価: 100 COIN/個）<br>
          <span style="color:#555">使用すると定期預金を期限前でも<strong>利息込みで即時引き出し</strong>できる</span>
        </div>
        <div style="background:#fff8e1;border-radius:6px;padding:8px 10px;font-size:12px">
          <strong>🎯 ルーレット当選番号速報</strong>（原価: <span style="color:#e74c3c;font-weight:700">20,000 COIN/個</span>）<br>
          <span style="color:#555">10%の確率で次回ルーレットの当選番号が事前にわかる<br>
          ※ 当たるかどうかは生産時点で決定される（外れでも1枚消費）</span>
        </div>
        <div style="background:#f9f8f6;border-radius:6px;padding:8px 10px;font-size:12px">
          <strong>🔍 株売買履歴閲覧装置</strong>（原価: 100 COIN/個）<br>
          <span style="color:#555">使用すると24時間、全プレイヤーの株売買履歴を閲覧できる</span>
        </div>
        <div style="background:#f9f8f6;border-radius:6px;padding:8px 10px;font-size:12px">
          <strong>⚡ 特性変更チケット</strong>（原価: 100 COIN/個）<br>
          <span style="color:#555">使用すると24時間だけ指定した特性に変更できる（5種類全て生産可能）<br>
          期限が切れると元の特性に自動で戻る</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 13. アイテム一覧 -->
  <div class="card">
    <div class="card-title">⑬ アイテムの使い方</div>
    <p style="font-size:13px;line-height:1.9;color:#333;margin-bottom:10px">
      販売所でアイテムを購入すると「販売所」タブの<strong>所持アイテム</strong>欄に表示されます。
      各アイテムの使用ボタンを押すことで効果が発動します。
    </p>
    <div style="background:#eff6ff;border-radius:6px;padding:10px 12px;font-size:12px;color:#1d4ed8;line-height:1.8">
      💡 アイテムは使い捨てです（1枚につき1回限り）。<br>
      特性変更チケット・株売買履歴閲覧装置は<strong>効果時間が24時間</strong>で、期限が来ると自動で元に戻ります。<br>
      ルーレット当選番号速報は当たり・外れどちらも使用時に1枚消費されます。
    </div>
  </div>`;
}
