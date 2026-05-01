param(
    [string]$OutDir = "УС- ДДС"
)

$ErrorActionPreference = "Stop"

$opsPath = Join-Path $OutDir "dds_operations.csv"
$dailyPath = Join-Path $OutDir "daily_cashflow.csv"

$ops = Import-Csv -Path $opsPath -Encoding UTF8 | ForEach-Object {
    [pscustomobject]@{
        date = $_."Дата"
        operation = $_."Операция"
        article = $_."Статья"
        inflow = [double]($_."Поступления" -replace ",", ".")
        outflow = [double]($_."Списания" -replace ",", ".")
        net = [double]($_."Чистый поток" -replace ",", ".")
    }
}

$daily = @(Import-Csv -Path $dailyPath -Encoding UTF8)
$initialBalance = 0.0
if ($daily.Count -gt 0) {
    $firstBalance = [double]($daily[0].Balance -replace ",", ".")
    $firstNet = [double]($daily[0].Net -replace ",", ".")
    $initialBalance = [math]::Round($firstBalance - $firstNet, 2)
}

$data = [pscustomobject]@{
    initialBalance = $initialBalance
    operations = $ops
}
$json = $data | ConvertTo-Json -Depth 6 -Compress

$template = @'
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Дашборд ДДС</title>
<style>
:root{--bg:#f5f7fa;--panel:#fff;--ink:#202733;--muted:#687385;--line:#d9e0ea;--green:#18805b;--red:#bd3b3b;--blue:#255f99;--amber:#a66b00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.35 "Segoe UI",Arial,sans-serif}main{max-width:1320px;margin:0 auto;padding:18px}
.top{display:flex;justify-content:space-between;gap:14px;align-items:flex-end;margin-bottom:10px}h1{font-size:26px;line-height:1.1;margin:0 0 4px}.muted{color:var(--muted)}
.panel,.kpi{background:var(--panel);border:1px solid var(--line);border-radius:8px}.panel{padding:12px;min-width:0}.panel h2{font-size:14px;margin:0 0 9px}.grid{display:grid;gap:10px}
.filters{grid-template-columns:1fr 1fr;margin-bottom:10px}.filter-row{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end}.field label{display:block;color:var(--muted);font-size:11px;margin-bottom:3px}input{width:100%;height:32px;border:1px solid var(--line);border-radius:6px;padding:0 8px;background:#fff;color:var(--ink)}
button{height:32px;border:1px solid #b9c5d4;border-radius:6px;background:#eef3f8;color:#1f334a;padding:0 10px;cursor:pointer}button:hover{background:#e4edf6}.primary{background:#dff3e9;border-color:#9bd2ba}.danger{background:#f8e7e7;border-color:#deb1b1}
.entry-row{display:grid;grid-template-columns:140px 150px 1fr 150px auto;gap:8px;align-items:end}.entry-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.added-box{max-height:120px;overflow:auto;margin-top:8px;border-top:1px solid var(--line)}
.kpis{grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:10px}.kpi{padding:10px 12px}.kpi span{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.03em}.kpi b{display:block;margin-top:4px;font-size:18px;white-space:nowrap}.pos{color:var(--green)}.neg{color:var(--red)}
.compare{grid-template-columns:1fr 1fr 1fr;margin-bottom:10px}.compare-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.compare-cell{border-left:3px solid var(--line);padding-left:8px;min-width:0}.compare-cell span{display:block;color:var(--muted);font-size:11px}.compare-cell b{display:block;font-size:16px;margin-top:2px;white-space:nowrap}.compare-cell.diff{border-left-color:var(--blue)}.charts{grid-template-columns:1.35fr 1fr}.two{grid-template-columns:1fr 1fr;margin-top:10px}
canvas{width:100%;height:240px;display:block}.two canvas{height:230px}table{width:100%;border-collapse:collapse}td,th{padding:6px 7px;border-bottom:1px solid #edf1f5;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}.num{text-align:right;white-space:nowrap}.note{font-size:11px;color:var(--muted);margin-top:8px}
@media (max-width:940px){main{padding:14px}.top{display:block}.filters,.filter-row,.entry-row,.kpis,.compare,.charts,.two{grid-template-columns:1fr}.kpi b{font-size:17px}.compare-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
  <section class="top">
    <div>
      <h1>Дашборд ДДС</h1>
      <div class="muted" id="periodText">Расчет включает начальный остаток.</div>
    </div>
    <div class="muted">Источник: База_операций</div>
  </section>

  <section class="grid filters">
    <div class="panel">
      <h2>Период 1</h2>
      <div class="filter-row">
        <div class="field"><label>Начало</label><input id="p1Start" type="date"></div>
        <div class="field"><label>Конец</label><input id="p1End" type="date"></div>
        <button id="allPeriod">Весь период</button>
      </div>
    </div>
    <div class="panel">
      <h2>Период 2 для сравнения</h2>
      <div class="filter-row">
        <div class="field"><label>Начало</label><input id="p2Start" type="date"></div>
        <div class="field"><label>Конец</label><input id="p2End" type="date"></div>
        <button id="prevPeriod">Предыдущий</button>
      </div>
    </div>
  </section>

  <section class="panel" style="margin-bottom:10px">
    <h2>Добавить операцию</h2>
    <div class="entry-row">
      <div class="field"><label>Дата</label><input id="newDate" type="date"></div>
      <div class="field"><label>Операция</label><input id="newOperation" list="operationList" value="Поступление"></div>
      <div class="field"><label>Статья</label><input id="newArticle" list="articleList" placeholder="Например: Оплата от покупателя"></div>
      <div class="field"><label>Сумма</label><input id="newAmount" inputmode="decimal" placeholder="0,00"></div>
      <button class="primary" id="addOperation">Добавить</button>
    </div>
    <datalist id="operationList"><option value="Поступление"><option value="Списание"></datalist>
    <datalist id="articleList"></datalist>
    <div class="entry-actions">
      <button id="refreshDashboard">Обновить дашборд</button>
      <button id="exportAdded">Скачать добавленные строки CSV</button>
      <button class="danger" id="clearAdded">Очистить добавленные</button>
      <span class="muted" id="addedCount">Добавлено: 0</span>
    </div>
    <div class="added-box">
      <table><thead><tr><th>Дата</th><th>Операция</th><th>Статья</th><th class="num">Сумма</th></tr></thead><tbody id="addedRows"></tbody></table>
    </div>
  </section>

  <section class="grid kpis">
    <div class="kpi"><span>Остаток на начало периода</span><b id="kStart">0</b></div>
    <div class="kpi"><span>Поступления</span><b id="kIn" class="pos">0</b></div>
    <div class="kpi"><span>Списания</span><b id="kOut" class="neg">0</b></div>
    <div class="kpi"><span>Чистый поток</span><b id="kNet">0</b></div>
    <div class="kpi"><span>Остаток на конец периода</span><b id="kEnd">0</b></div>
  </section>

  <section class="grid compare">
    <div class="panel">
      <h2>Поступления</h2>
      <div class="compare-grid">
        <div class="compare-cell"><span>Период 1</span><b class="pos" id="cInP1">0</b></div>
        <div class="compare-cell"><span>Период 2</span><b id="cInP2">0</b></div>
        <div class="compare-cell diff"><span>Разница</span><b id="cInDelta">0</b></div>
      </div>
    </div>
    <div class="panel">
      <h2>Списания</h2>
      <div class="compare-grid">
        <div class="compare-cell"><span>Период 1</span><b class="neg" id="cOutP1">0</b></div>
        <div class="compare-cell"><span>Период 2</span><b id="cOutP2">0</b></div>
        <div class="compare-cell diff"><span>Разница</span><b id="cOutDelta">0</b></div>
      </div>
    </div>
    <div class="panel">
      <h2>Чистый поток</h2>
      <div class="compare-grid">
        <div class="compare-cell"><span>Период 1</span><b id="cNetP1">0</b></div>
        <div class="compare-cell"><span>Период 2</span><b id="cNetP2">0</b></div>
        <div class="compare-cell diff"><span>Разница</span><b id="cNetDelta">0</b></div>
      </div>
    </div>
  </section>

  <section class="grid charts">
    <div class="panel"><h2>Остаток денежных средств по дням</h2><canvas id="balanceChart"></canvas></div>
    <div class="panel"><h2>Поступления и списания</h2><canvas id="flowChart"></canvas></div>
  </section>

  <section class="grid two">
    <div class="panel">
      <h2>Статьи поступлений</h2>
      <canvas id="incomeChart"></canvas>
      <table><thead><tr><th>Статья</th><th class="num">Сумма</th></tr></thead><tbody id="incomeRows"></tbody></table>
    </div>
    <div class="panel">
      <h2>Статьи затрат</h2>
      <canvas id="expenseChart"></canvas>
      <table><thead><tr><th>Статья</th><th class="num">Сумма</th></tr></thead><tbody id="expenseRows"></tbody></table>
      <div class="note">Слева показаны поступления, справа статьи затрат. Таблицы и графики пересчитываются по периоду 1.</div>
    </div>
  </section>
</main>
<script>
const report = __DATA__;
const baseOps = report.operations.map(o => ({...o, day: new Date(o.date + 'T00:00:00'), source:'base'}));
let addedOps = JSON.parse(localStorage.getItem('ddsAddedOperations') || '[]').map(o => ({...o, day: new Date(o.date + 'T00:00:00'), source:'manual'}));
let ops = [];
const initialBalance = report.initialBalance;
const money = v => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 0}).format(v || 0);
const money2 = v => new Intl.NumberFormat('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(v || 0);
const byId = id => document.getElementById(id);
let minDate = '', maxDate = '';

function rebuildOps(){
  ops = [...baseOps, ...addedOps].sort((a,b)=>a.date.localeCompare(b.date));
  minDate = ops.reduce((m,o)=>!m || o.date < m ? o.date : m, '');
  maxDate = ops.reduce((m,o)=>!m || o.date > m ? o.date : m, '');
}
function parseAmount(text){
  const clean = String(text || '').replace(/\s/g,'').replace(',', '.').replace(/[^0-9.-]/g,'');
  return Math.abs(Number(clean) || 0);
}
function saveAdded(){
  localStorage.setItem('ddsAddedOperations', JSON.stringify(addedOps.map(({day,source,...o})=>o)));
}
function updateArticleList(){
  const articles = [...new Set(ops.map(o=>o.article).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  byId('articleList').innerHTML = articles.map(a=>`<option value="${a}">`).join('');
}
function renderAddedRows(){
  byId('addedCount').textContent = `Добавлено: ${addedOps.length}`;
  byId('addedRows').innerHTML = addedOps.slice().reverse().slice(0,20).map(o=>`<tr><td>${o.date}</td><td>${o.operation}</td><td>${o.article}</td><td class="num">${money2(o.inflow || o.outflow)}</td></tr>`).join('') || '<tr><td colspan="4">Пока нет добавленных строк</td></tr>';
}

function readRange(prefix){ return {start: byId(prefix+'Start').value || minDate, end: byId(prefix+'End').value || maxDate}; }
function inRange(o, r){ return o.date >= r.start && o.date <= r.end; }
function balanceBefore(date){ return initialBalance + ops.filter(o => o.date < date).reduce((s,o)=>s+o.net,0); }
function summarize(range){
  const rows = ops.filter(o => inRange(o, range));
  const inflow = rows.reduce((s,o)=>s+o.inflow,0), outflow = rows.reduce((s,o)=>s+o.outflow,0);
  const net = inflow - outflow, start = balanceBefore(range.start), end = start + net;
  return {rows, inflow, outflow, net, start, end};
}
function groupArticles(rows, key){
  const map = new Map();
  rows.filter(o=>o[key]>0).forEach(o=>map.set(o.article, (map.get(o.article)||0)+o[key]));
  return [...map].map(([Article,Amount])=>({Article,Amount})).sort((a,b)=>b.Amount-a.Amount);
}
function dailyRows(range){
  const dates = [...new Set(ops.filter(o=>inRange(o,range)).map(o=>o.date))].sort();
  let running = balanceBefore(range.start);
  return dates.map(d=>{
    const rows = ops.filter(o=>o.date===d);
    const inflow = rows.reduce((s,o)=>s+o.inflow,0), outflow = rows.reduce((s,o)=>s+o.outflow,0);
    const net = inflow - outflow; running += net;
    return {Date:d, Label:d.slice(8,10)+'.'+d.slice(5,7), Inflow:inflow, Outflow:outflow, Net:net, Balance:running};
  });
}
function pct(a,b){ if(!b) return a ? 'н/д' : '0%'; return ((a-b)/Math.abs(b)*100).toFixed(1).replace('.', ',') + '%'; }
function deltaText(a,b){ const diff=a-b; return (diff>=0?'+':'') + money2(diff) + ' / ' + pct(a,b); }
function setCompare(prefix, a, b){
  byId(prefix+'P1').textContent = money2(a);
  byId(prefix+'P2').textContent = money2(b);
  const delta = byId(prefix+'Delta');
  delta.textContent = deltaText(a, b);
  delta.className = a - b >= 0 ? 'pos' : 'neg';
}
function tableRows(id, rows){
  byId(id).innerHTML = rows.slice(0,12).map(r=>`<tr><td>${r.Article}</td><td class="num">${money2(r.Amount)}</td></tr>`).join('') || '<tr><td colspan="2">Нет данных</td></tr>';
}
function setup(canvas){ const dpr=window.devicePixelRatio||1, rect=canvas.getBoundingClientRect(); canvas.width=Math.max(1,rect.width*dpr); canvas.height=Math.max(1,rect.height*dpr); const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,rect.width,rect.height); return {ctx,w:rect.width,h:rect.height}; }
function axes(ctx,w,h,p){ ctx.strokeStyle='#d9e0ea'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(p.l,p.t); ctx.lineTo(p.l,h-p.b); ctx.lineTo(w-p.r,h-p.b); ctx.stroke(); }
function lineChart(id, rows, key, color){
  const {ctx,w,h}=setup(byId(id)), p={l:62,r:16,t:18,b:42}; axes(ctx,w,h,p); if(!rows.length) return;
  const vals=rows.map(r=>r[key]), min=Math.min(...vals,0), max=Math.max(...vals,1);
  const x=i=>p.l+(w-p.l-p.r)*(rows.length===1?0:i/(rows.length-1)), y=v=>h-p.b-(h-p.t-p.b)*((v-min)/(max-min||1));
  ctx.strokeStyle=color; ctx.lineWidth=2.5; ctx.beginPath(); rows.forEach((r,i)=>i?ctx.lineTo(x(i),y(r[key])):ctx.moveTo(x(i),y(r[key]))); ctx.stroke();
  ctx.fillStyle=color; rows.forEach((r,i)=>{ctx.beginPath();ctx.arc(x(i),y(r[key]),3,0,Math.PI*2);ctx.fill()});
  ctx.fillStyle='#687385'; ctx.font='12px Segoe UI, Arial'; ctx.fillText(money(max),6,p.t+8); ctx.fillText(money(min),6,h-p.b);
  rows.forEach((r,i)=>{if(i===0||i===rows.length-1||i%5===0)ctx.fillText(r.Label,x(i)-14,h-14)});
}
const palette = ['#18805b','#255f99','#bd3b3b','#a66b00','#6d5bd0','#00838f','#7a4b2a','#677483','#c2410c','#2f855a','#8b5cf6'];
function pieChart(id, rows, options={}){
  const {ctx,w,h}=setup(byId(id)); if(!rows.length) return;
  const total=rows.reduce((s,r)=>s+r.Amount,0); if(!total) return;
  const donut = options.donut !== false;
  const cx=w*.42, cy=h*.5, radius=Math.max(54, Math.min(w*.25,h*.34));
  let start=-Math.PI/2;
  ctx.font='11px Segoe UI, Arial'; ctx.lineWidth=1;
  rows.slice(0,8).forEach((r,i)=>{
    const val=r.Amount, angle=val/total*Math.PI*2, end=start+angle, mid=start+angle/2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,radius,start,end); ctx.closePath();
    ctx.fillStyle=options.colors ? options.colors[i%options.colors.length] : palette[i%palette.length]; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.stroke();
    if(angle>.18){
      const sx=cx+Math.cos(mid)*radius*.78, sy=cy+Math.sin(mid)*radius*.78;
      const ex=cx+Math.cos(mid)*(radius+16), ey=cy+Math.sin(mid)*(radius+16);
      const labelRight = Math.cos(mid) >= 0;
      const lx=ex+(labelRight?10:-10), ly=ey;
      ctx.strokeStyle='#9aa5b4'; ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.lineTo(lx,ly); ctx.stroke();
      ctx.fillStyle='#202733'; ctx.textAlign=labelRight?'left':'right';
      const percent=(val/total*100).toFixed(1).replace('.', ',')+'%';
      const label=r.Article.length>18?r.Article.slice(0,17)+'…':r.Article;
      ctx.fillText(label, lx, ly-3); ctx.fillStyle='#687385'; ctx.fillText(percent+' / '+money(val), lx, ly+11);
    }
    start=end;
  });
  if(donut){
    ctx.beginPath(); ctx.arc(cx,cy,radius*.52,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
    ctx.textAlign='center'; ctx.fillStyle='#202733'; ctx.font='700 15px Segoe UI, Arial'; ctx.fillText(money(total),cx,cy+4);
    ctx.font='11px Segoe UI, Arial'; ctx.fillStyle='#687385'; ctx.fillText(options.center || 'Итого',cx,cy+20);
  }
}
function flowPieChart(id, inflow, outflow){
  pieChart(id, [
    {Article:'Поступления', Amount:inflow},
    {Article:'Списания', Amount:outflow}
  ], {colors:['#18805b','#bd3b3b'], center:'ДДС'});
}
function setDefaults(){
  rebuildOps();
  byId('p1Start').value=minDate; byId('p1End').value=maxDate;
  byId('newDate').value=maxDate;
  const start=new Date(minDate+'T00:00:00'), end=new Date(maxDate+'T00:00:00'), days=Math.round((end-start)/86400000)+1;
  const p2End=new Date(start); p2End.setDate(p2End.getDate()-1); const p2Start=new Date(p2End); p2Start.setDate(p2Start.getDate()-days+1);
  byId('p2Start').value=p2Start.toISOString().slice(0,10); byId('p2End').value=p2End.toISOString().slice(0,10);
  updateArticleList(); renderAddedRows();
}
function render(){
  rebuildOps(); updateArticleList(); renderAddedRows();
  if(!byId('p1Start').value) byId('p1Start').value=minDate;
  if(!byId('p1End').value) byId('p1End').value=maxDate;
  const r1=readRange('p1'), r2=readRange('p2'), s1=summarize(r1), s2=summarize(r2), days=dailyRows(r1);
  byId('periodText').textContent=`Период 1: ${r1.start} - ${r1.end}. Расчет включает начальный остаток.`;
  byId('kStart').textContent=money2(s1.start); byId('kIn').textContent=money2(s1.inflow); byId('kOut').textContent=money2(s1.outflow); byId('kNet').textContent=money2(s1.net); byId('kEnd').textContent=money2(s1.end);
  setCompare('cIn', s1.inflow, s2.inflow); setCompare('cOut', s1.outflow, s2.outflow); setCompare('cNet', s1.net, s2.net);
  const income=groupArticles(s1.rows,'inflow'), expense=groupArticles(s1.rows,'outflow');
  tableRows('incomeRows', income); tableRows('expenseRows', expense);
  lineChart('balanceChart', days, 'Balance', '#255f99'); flowPieChart('flowChart', s1.inflow, s1.outflow); pieChart('incomeChart', income, {center:'Поступления'}); pieChart('expenseChart', expense, {center:'Затраты'});
}
function addManualOperation(){
  const date = byId('newDate').value;
  const operation = byId('newOperation').value.trim();
  const article = byId('newArticle').value.trim() || 'Без статьи';
  const amount = parseAmount(byId('newAmount').value);
  if(!date || !['Поступление','Списание'].includes(operation) || amount <= 0){
    alert('Заполните дату, операцию и сумму больше нуля.');
    return;
  }
  addedOps.push({
    date,
    operation,
    article,
    inflow: operation === 'Поступление' ? amount : 0,
    outflow: operation === 'Списание' ? amount : 0,
    net: operation === 'Поступление' ? amount : -amount,
    day: new Date(date + 'T00:00:00'),
    source: 'manual'
  });
  saveAdded();
  byId('newArticle').value='';
  byId('newAmount').value='';
  byId('p1End').value = date > (byId('p1End').value || '') ? date : byId('p1End').value;
  render();
}
function exportAddedCsv(){
  const header = 'Дата;Операция;Статья;Сумма\n';
  const rows = addedOps.map(o => [o.date,o.operation,o.article,String(o.inflow || o.outflow).replace('.', ',')].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + header + rows], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'dds_added_operations.csv'; a.click();
  URL.revokeObjectURL(url);
}
byId('allPeriod').addEventListener('click',()=>{byId('p1Start').value=minDate;byId('p1End').value=maxDate;render()});
byId('prevPeriod').addEventListener('click',()=>{const s=new Date(byId('p1Start').value+'T00:00:00'), e=new Date(byId('p1End').value+'T00:00:00'), days=Math.round((e-s)/86400000)+1, p2e=new Date(s);p2e.setDate(p2e.getDate()-1);const p2s=new Date(p2e);p2s.setDate(p2s.getDate()-days+1);byId('p2Start').value=p2s.toISOString().slice(0,10);byId('p2End').value=p2e.toISOString().slice(0,10);render()});
['p1Start','p1End','p2Start','p2End'].forEach(id=>byId(id).addEventListener('change',render));
byId('addOperation').addEventListener('click', addManualOperation);
byId('refreshDashboard').addEventListener('click', render);
byId('exportAdded').addEventListener('click', exportAddedCsv);
byId('clearAdded').addEventListener('click',()=>{ if(confirm('Очистить все строки, добавленные в этом дашборде?')){ addedOps=[]; saveAdded(); render(); }});
window.addEventListener('resize',render);
setDefaults(); render();
</script>
</body>
</html>
'@

$html = $template.Replace("__DATA__", $json)
$outPath = Join-Path $OutDir "ДДС_дашборд.html"
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText((Join-Path (Resolve-Path $OutDir) "ДДС_дашборд.html"), $html, $utf8Bom)
[System.IO.File]::WriteAllText((Join-Path (Resolve-Path $OutDir) "dashboard.html"), $html, $utf8Bom)

[pscustomobject]@{
    Dashboard = (Resolve-Path $outPath).Path
    Operations = $ops.Count
    InitialBalance = $initialBalance
}
