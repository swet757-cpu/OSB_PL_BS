param(
    [string]$InputXlsx = "УС- ДДС\source.xlsx",
    [string]$OutDir = "УС- ДДС"
)

$ErrorActionPreference = "Stop"

function Get-ColName([string]$cellRef) {
    return ($cellRef -replace '\d', '')
}

function Convert-ExcelSerialDate($value) {
    if ([string]::IsNullOrWhiteSpace([string]$value)) { return $null }
    $number = [double]::Parse(([string]$value), [Globalization.CultureInfo]::InvariantCulture)
    return ([datetime]"1899-12-30").AddDays($number).Date
}

function Convert-Amount($value) {
    if ($null -eq $value) { return 0.0 }
    $text = ([string]$value).Trim()
    if ($text -eq "") { return 0.0 }
    $text = $text -replace [char]160, " "
    $text = $text -replace "\s", ""
    $text = $text -replace "[^0-9,\.\-]", ""
    if ($text -eq "" -or $text -eq "-") { return 0.0 }
    if ($text.Contains(",")) {
        $text = $text -replace "\.", ""
        $text = $text -replace ",", "."
    }
    return [double]::Parse($text, [Globalization.CultureInfo]::InvariantCulture)
}

function Format-Money($value) {
    return ([double]$value).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("ru-RU"))
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$workDir = Join-Path $OutDir "xlsx_unpacked"
$zipPath = Join-Path $OutDir "source.zip"
Copy-Item -LiteralPath $InputXlsx -Destination $zipPath -Force
Expand-Archive -LiteralPath $zipPath -DestinationPath $workDir -Force

$xlDir = Join-Path $workDir "xl"
[xml]$sharedXml = Get-Content (Join-Path $xlDir "sharedStrings.xml") -Encoding UTF8
$sharedNs = New-Object System.Xml.XmlNamespaceManager($sharedXml.NameTable)
$sharedNs.AddNamespace("d", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
$sharedStrings = @()
foreach ($si in $sharedXml.SelectNodes("//d:si", $sharedNs)) {
    $sharedStrings += (($si.SelectNodes(".//d:t", $sharedNs) | ForEach-Object { $_.'#text' }) -join "")
}

[xml]$sheetXml = Get-Content (Join-Path $xlDir "worksheets\sheet1.xml") -Encoding UTF8
$sheetNs = New-Object System.Xml.XmlNamespaceManager($sheetXml.NameTable)
$sheetNs.AddNamespace("d", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

$rows = @()
foreach ($rowNode in $sheetXml.SelectNodes("//d:sheetData/d:row", $sheetNs)) {
    $cells = @{}
    foreach ($cell in $rowNode.SelectNodes("d:c", $sheetNs)) {
        $v = $cell.SelectSingleNode("d:v", $sheetNs)
        if ($null -eq $v) {
            $value = ""
        } elseif ($cell.t -eq "s") {
            $value = $sharedStrings[[int]$v.InnerText]
        } else {
            $value = $v.InnerText
        }
        $cells[(Get-ColName $cell.r)] = $value
    }
    if ($cells.Count -gt 0) { $rows += ,$cells }
}

$initialRows = @($rows | Where-Object { ([string]$_["C"]).Trim() -eq "Остаток на начало" })
$initialBalance = 0.0
$initialDate = $null
if ($initialRows.Count -gt 0) {
    $initialBalance = Convert-Amount $initialRows[0]["E"]
    $initialDate = Convert-ExcelSerialDate $initialRows[0]["A"]
}

$records = @()
foreach ($r in $rows) {
    $reportType = ([string]$r["B"]).Trim()
    $operation = ([string]$r["C"]).Trim()
    if ($reportType -ne "ДДС") { continue }
    if ($operation -notin @("Поступление", "Списание")) { continue }

    $date = Convert-ExcelSerialDate $r["A"]
    if ($null -eq $date) { continue }

    $article = ([string]$r["D"]).Trim()
    if ($article -eq "" -or $article -eq "0.0") { $article = "Без статьи" }

    $amount = [math]::Abs((Convert-Amount $r["E"]))
    if ($amount -eq 0) { continue }

    $records += [pscustomobject]@{
        Date = $date
        Operation = $operation
        Article = $article
        Inflow = if ($operation -eq "Поступление") { $amount } else { 0.0 }
        Outflow = if ($operation -eq "Списание") { $amount } else { 0.0 }
        Net = if ($operation -eq "Поступление") { $amount } else { -$amount }
    }
}

$totalInflow = ($records | Measure-Object -Property Inflow -Sum).Sum
$totalOutflow = ($records | Measure-Object -Property Outflow -Sum).Sum
$netFlow = $totalInflow - $totalOutflow
$endingBalance = $initialBalance + $netFlow

$daily = @()
$running = $initialBalance
foreach ($group in ($records | Group-Object Date | Sort-Object { $_.Group[0].Date })) {
    $inflow = ($group.Group | Measure-Object -Property Inflow -Sum).Sum
    $outflow = ($group.Group | Measure-Object -Property Outflow -Sum).Sum
    $net = $inflow - $outflow
    $running += $net
    $date = $group.Group[0].Date
    $daily += [pscustomobject]@{
        Date = $date.ToString("yyyy-MM-dd")
        Label = $date.ToString("dd.MM")
        Inflow = [math]::Round($inflow, 2)
        Outflow = [math]::Round($outflow, 2)
        Net = [math]::Round($net, 2)
        Balance = [math]::Round($running, 2)
    }
}

$expenseByArticle = $records |
    Where-Object { $_.Outflow -gt 0 } |
    Group-Object Article |
    ForEach-Object {
        [pscustomobject]@{
            Article = $_.Name
            Amount = [math]::Round((($_.Group | Measure-Object -Property Outflow -Sum).Sum), 2)
        }
    } |
    Sort-Object Amount -Descending

$incomeByArticle = $records |
    Where-Object { $_.Inflow -gt 0 } |
    Group-Object Article |
    ForEach-Object {
        [pscustomobject]@{
            Article = $_.Name
            Amount = [math]::Round((($_.Group | Measure-Object -Property Inflow -Sum).Sum), 2)
        }
    } |
    Sort-Object Amount -Descending

$records |
    Sort-Object Date, Operation, Article |
    Select-Object @{n="Дата";e={$_.Date.ToString("yyyy-MM-dd")}}, @{n="Операция";e={$_.Operation}}, @{n="Статья";e={$_.Article}}, @{n="Поступления";e={$_.Inflow}}, @{n="Списания";e={$_.Outflow}}, @{n="Чистый поток";e={$_.Net}} |
    Export-Csv -Path (Join-Path $OutDir "dds_operations.csv") -Encoding UTF8 -NoTypeInformation

$expenseByArticle | Export-Csv -Path (Join-Path $OutDir "expense_by_article.csv") -Encoding UTF8 -NoTypeInformation
$daily | Export-Csv -Path (Join-Path $OutDir "daily_cashflow.csv") -Encoding UTF8 -NoTypeInformation

$summary = [pscustomobject]@{
    InitialBalance = [math]::Round($initialBalance, 2)
    InitialDate = if ($initialDate) { $initialDate.ToString("yyyy-MM-dd") } else { "" }
    TotalInflow = [math]::Round($totalInflow, 2)
    TotalOutflow = [math]::Round($totalOutflow, 2)
    NetFlow = [math]::Round($netFlow, 2)
    EndingBalance = [math]::Round($endingBalance, 2)
    OperationsCount = $records.Count
}

$data = [pscustomobject]@{
    summary = $summary
    daily = $daily
    expenses = $expenseByArticle
    income = $incomeByArticle
}
$json = $data | ConvertTo-Json -Depth 6 -Compress

$topExpenseRows = ($expenseByArticle | Select-Object -First 12 | ForEach-Object {
    "<tr><td>$([System.Net.WebUtility]::HtmlEncode($_.Article))</td><td class='num'>$(Format-Money $_.Amount)</td></tr>"
}) -join "`n"

$topIncomeRows = ($incomeByArticle | Select-Object -First 8 | ForEach-Object {
    "<tr><td>$([System.Net.WebUtility]::HtmlEncode($_.Article))</td><td class='num'>$(Format-Money $_.Amount)</td></tr>"
}) -join "`n"

$periodLabel = if ($daily.Count -gt 0) { "$($daily[0].Date) - $($daily[-1].Date)" } else { "" }
$html = @"
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Дашборд ДДС</title>
<style>
:root{--bg:#f6f7f9;--panel:#fff;--ink:#1f2933;--muted:#657080;--line:#d9dee7;--green:#18805b;--red:#bd3b3b;--blue:#2563a8;--gold:#a66b00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 "Segoe UI",Arial,sans-serif}
main{max-width:1280px;margin:0 auto;padding:28px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:20px}
h1{font-size:30px;line-height:1.1;margin:0 0 8px}.muted{color:var(--muted)}.grid{display:grid;gap:14px}.kpis{grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:16px}
.kpi,.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px}.kpi{padding:16px}.kpi b{display:block;font-size:22px;margin-top:7px;white-space:nowrap}.kpi span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.charts{grid-template-columns:1.35fr 1fr}.panel{padding:18px;min-width:0}.panel h2{font-size:16px;margin:0 0 12px}.two{grid-template-columns:1fr 1fr;margin-top:14px}
canvas{width:100%;height:320px;display:block}table{width:100%;border-collapse:collapse}td,th{padding:9px 8px;border-bottom:1px solid #edf0f4;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}.num{text-align:right;white-space:nowrap}
.pos{color:var(--green)}.neg{color:var(--red)}.note{font-size:12px;color:var(--muted);margin-top:10px}
@media (max-width:900px){main{padding:18px}.top{display:block}.kpis,.charts,.two{grid-template-columns:1fr}.kpi b{font-size:20px}}
</style>
</head>
<body>
<main>
  <section class="top">
    <div>
      <h1>Дашборд ДДС</h1>
      <div class="muted">Период: $periodLabel. Расчет включает начальный остаток.</div>
    </div>
    <div class="muted">Источник: База_операций</div>
  </section>

  <section class="grid kpis">
    <div class="kpi"><span>Начальный остаток</span><b>$(Format-Money $initialBalance)</b></div>
    <div class="kpi"><span>Поступления</span><b class="pos">$(Format-Money $totalInflow)</b></div>
    <div class="kpi"><span>Списания</span><b class="neg">$(Format-Money $totalOutflow)</b></div>
    <div class="kpi"><span>Чистый поток</span><b>$(Format-Money $netFlow)</b></div>
    <div class="kpi"><span>Конечный остаток</span><b>$(Format-Money $endingBalance)</b></div>
  </section>

  <section class="grid charts">
    <div class="panel">
      <h2>Остаток денежных средств по дням</h2>
      <canvas id="balanceChart" width="900" height="320"></canvas>
    </div>
    <div class="panel">
      <h2>Поступления и списания по дням</h2>
      <canvas id="flowChart" width="560" height="320"></canvas>
    </div>
  </section>

  <section class="grid two">
    <div class="panel">
      <h2>Статьи затрат</h2>
      <canvas id="expenseChart" width="620" height="360"></canvas>
      <table><thead><tr><th>Статья</th><th class="num">Сумма</th></tr></thead><tbody>$topExpenseRows</tbody></table>
    </div>
    <div class="panel">
      <h2>Статьи поступлений</h2>
      <canvas id="incomeChart" width="620" height="360"></canvas>
      <table><thead><tr><th>Статья</th><th class="num">Сумма</th></tr></thead><tbody>$topIncomeRows</tbody></table>
      <div class="note">В дашборде отражены операции с типом отчета ДДС: поступления и списания.</div>
    </div>
  </section>
</main>
<script>
const report = $json;
const money = value => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 0}).format(value);
function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return {ctx, w: rect.width, h: rect.height};
}
function axes(ctx, w, h, pad) {
  ctx.strokeStyle = '#d9dee7'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h-pad.b); ctx.lineTo(w-pad.r, h-pad.b); ctx.stroke();
}
function lineChart(id, rows, key, color) {
  const {ctx,w,h} = setup(document.getElementById(id));
  const pad = {l:62,r:16,t:18,b:42}; axes(ctx,w,h,pad);
  const vals = rows.map(r=>r[key]); const min = Math.min(...vals, 0); const max = Math.max(...vals, 1);
  const x = i => pad.l + (w-pad.l-pad.r) * (rows.length === 1 ? 0 : i/(rows.length-1));
  const y = v => h-pad.b - (h-pad.t-pad.b) * ((v-min)/(max-min || 1));
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath();
  rows.forEach((r,i)=> i ? ctx.lineTo(x(i), y(r[key])) : ctx.moveTo(x(i), y(r[key]))); ctx.stroke();
  ctx.fillStyle = color; rows.forEach((r,i)=>{ctx.beginPath();ctx.arc(x(i),y(r[key]),3,0,Math.PI*2);ctx.fill()});
  ctx.fillStyle = '#657080'; ctx.font = '12px Segoe UI, Arial'; ctx.fillText(money(max), 6, pad.t+8); ctx.fillText(money(min), 6, h-pad.b);
  rows.forEach((r,i)=>{ if(i===0 || i===rows.length-1 || i%5===0){ ctx.fillText(r.Label, x(i)-14, h-14); }});
}
function groupedBarChart(id, rows) {
  const {ctx,w,h} = setup(document.getElementById(id));
  const pad = {l:54,r:16,t:18,b:42}; axes(ctx,w,h,pad);
  const max = Math.max(...rows.flatMap(r=>[r.Inflow,r.Outflow]),1);
  const innerW = w-pad.l-pad.r; const step = innerW / Math.max(rows.length,1); const bw = Math.max(3, step*.32);
  rows.forEach((r,i)=>{
    const base = h-pad.b; const x0 = pad.l + i*step + step*.18;
    const hi = (h-pad.t-pad.b)*(r.Inflow/max); const ho = (h-pad.t-pad.b)*(r.Outflow/max);
    ctx.fillStyle = '#18805b'; ctx.fillRect(x0, base-hi, bw, hi);
    ctx.fillStyle = '#bd3b3b'; ctx.fillRect(x0+bw+2, base-ho, bw, ho);
    if(i===0 || i===rows.length-1 || i%6===0){ ctx.fillStyle='#657080'; ctx.font='12px Segoe UI, Arial'; ctx.fillText(r.Label, x0-6, h-14); }
  });
}
function horizontalBarChart(id, rows, color) {
  rows = rows.slice(0, 10);
  const {ctx,w,h} = setup(document.getElementById(id));
  const pad = {l:170,r:20,t:12,b:18}; const max = Math.max(...rows.map(r=>r.Amount),1);
  const gap = 8; const barH = Math.max(14, (h-pad.t-pad.b)/Math.max(rows.length,1)-gap);
  ctx.font='12px Segoe UI, Arial';
  rows.forEach((r,i)=>{
    const y = pad.t + i*(barH+gap); const bw = (w-pad.l-pad.r)*(r.Amount/max);
    ctx.fillStyle='#1f2933'; let label = r.Article.length > 24 ? r.Article.slice(0,23)+'…' : r.Article; ctx.fillText(label, 8, y+barH*.72);
    ctx.fillStyle=color; ctx.fillRect(pad.l, y, bw, barH);
    ctx.fillStyle='#657080'; ctx.fillText(money(r.Amount), pad.l+bw+6, y+barH*.72);
  });
}
function render(){ lineChart('balanceChart', report.daily, 'Balance', '#2563a8'); groupedBarChart('flowChart', report.daily); horizontalBarChart('expenseChart', report.expenses, '#bd3b3b'); horizontalBarChart('incomeChart', report.income, '#18805b'); }
window.addEventListener('resize', render);
render();
</script>
</body>
</html>
"@

Set-Content -Path (Join-Path $OutDir "dashboard.html") -Value $html -Encoding UTF8

[pscustomobject]@{
    Dashboard = (Resolve-Path (Join-Path $OutDir "dashboard.html")).Path
    OperationsCsv = (Resolve-Path (Join-Path $OutDir "dds_operations.csv")).Path
    DailyCsv = (Resolve-Path (Join-Path $OutDir "daily_cashflow.csv")).Path
    ExpenseCsv = (Resolve-Path (Join-Path $OutDir "expense_by_article.csv")).Path
    InitialBalance = Format-Money $initialBalance
    EndingBalance = Format-Money $endingBalance
    Records = $records.Count
}
