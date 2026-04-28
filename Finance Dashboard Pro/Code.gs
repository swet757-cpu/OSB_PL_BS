const CONFIG = {
  operationsSheet: 'База_операций',
  notesSheet: 'Заметки',
  timezone: Session.getScriptTimeZone() || 'Europe/Moscow',
};

const OPERATION_COLUMNS = {
  date: 0,
  reportType: 1,
  operation: 2,
  article: 3,
  wallet: 4,
  direction: 5,
  amountVat: 6,
  vat: 7,
  amountNet: 8,
  comment: 9,
};

function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Finance Dashboard Pro')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getDashboardData(filters) {
  try {
    const normalizedFilters = normalizeFilters(filters || {});
    const operations = getOperations_();
    const filtered = filterOperations_(operations, normalizedFilters);
    const notes = getNotes_(normalizedFilters);

    return {
      ok: true,
      error: '',
      filters: buildFilterOptions_(operations),
      selectedFilters: normalizedFilters,
      hasData: filtered.length > 0,
      message: filtered.length ? '' : 'Нет данных за выбранный период',
      dds: buildDds_(filtered),
      opiu: buildOpiu_(filtered),
      charts: buildCharts_(filtered),
      notes,
      meta: {
        totalRows: operations.length,
        filteredRows: filtered.length,
        loadedAt: formatDateTime_(new Date()),
      },
    };
  } catch (error) {
    return errorResponse_(error);
  }
}

function addNote(note) {
  try {
    const sheet = getOrCreateNotesSheet_();
    const payload = normalizeNote_(note || {});
    sheet.appendRow([payload.date, payload.section, payload.text, payload.author]);
    return {
      ok: true,
      note: {
        date: formatDate_(payload.date),
        section: payload.section,
        text: payload.text,
        author: payload.author,
      },
    };
  } catch (error) {
    return errorResponse_(error);
  }
}

function getOperations_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.operationsSheet);
  if (!sheet) {
    throw new Error('Не найден лист База_операций');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  return values.map(parseOperationRow_).filter(Boolean);
}

function parseOperationRow_(row) {
  const date = parseDate_(row[OPERATION_COLUMNS.date]);
  if (!date) return null;

  const reportType = String(row[OPERATION_COLUMNS.reportType] || '').trim();
  const operation = String(row[OPERATION_COLUMNS.operation] || '').trim();
  if (!reportType || !operation) return null;

  return {
    date,
    dateIso: toIsoDate_(date),
    monthKey: Utilities.formatDate(date, CONFIG.timezone, 'yyyy-MM'),
    monthLabel: Utilities.formatDate(date, CONFIG.timezone, 'MM.yyyy'),
    reportType,
    operation,
    article: String(row[OPERATION_COLUMNS.article] || 'Без статьи').trim() || 'Без статьи',
    wallet: String(row[OPERATION_COLUMNS.wallet] || '').trim(),
    direction: String(row[OPERATION_COLUMNS.direction] || '').trim(),
    amountVat: parseAmount_(row[OPERATION_COLUMNS.amountVat]),
    vat: parseAmount_(row[OPERATION_COLUMNS.vat]),
    amountNet: parseAmount_(row[OPERATION_COLUMNS.amountNet]),
    comment: String(row[OPERATION_COLUMNS.comment] || '').trim(),
  };
}

function getNotes_(filters) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.notesSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  return values
    .map((row) => {
      const date = parseDate_(row[0]);
      if (!date) return null;
      if (filters.dateFrom && date < filters.dateFrom) return null;
      if (filters.dateTo && date > filters.dateTo) return null;
      return {
        date: formatDate_(date),
        dateIso: toIsoDate_(date),
        section: String(row[1] || '').trim(),
        text: String(row[2] || '').trim(),
        author: String(row[3] || '').trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
}

function getOrCreateNotesSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(CONFIG.notesSheet);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.notesSheet);
    sheet.getRange(1, 1, 1, 4).setValues([['Дата', 'Раздел', 'Заметка', 'Автор / источник']]);
  }
  return sheet;
}

function normalizeFilters(filters) {
  return {
    dateFrom: parseDate_(filters.dateFrom),
    dateTo: endOfDay_(parseDate_(filters.dateTo)),
    wallet: String(filters.wallet || '').trim(),
    direction: String(filters.direction || '').trim(),
  };
}

function normalizeNote_(note) {
  const date = parseDate_(note.date) || new Date();
  const section = String(note.section || 'ДДС').trim();
  const text = String(note.text || '').trim();
  if (!text) {
    throw new Error('Введите текст заметки');
  }
  return {
    date,
    section,
    text,
    author: String(note.author || Session.getActiveUser().getEmail() || 'Пользователь').trim(),
  };
}

function filterOperations_(operations, filters) {
  return operations.filter((item) => {
    if (filters.dateFrom && item.date < filters.dateFrom) return false;
    if (filters.dateTo && item.date > filters.dateTo) return false;
    if (filters.wallet && item.wallet !== filters.wallet) return false;
    if (filters.direction && item.direction !== filters.direction) return false;
    return true;
  });
}

function buildFilterOptions_(operations) {
  return {
    wallets: uniqueSorted_(operations.map((item) => item.wallet).filter(Boolean)),
    directions: uniqueSorted_(operations.map((item) => item.direction).filter(Boolean)),
  };
}

function buildDds_(operations) {
  const dds = operations.filter((item) => item.reportType === 'ДДС');
  const income = sumBy_(dds, (item) => item.operation === 'Поступление' ? item.amountVat : 0);
  const outcome = sumBy_(dds, (item) => item.operation === 'Списание' ? item.amountVat : 0);
  const netFlow = income - outcome;

  return {
    cards: {
      income,
      outcome,
      netFlow,
      operationsCount: dds.length,
    },
    byDate: buildDdsByDate_(dds),
    byArticle: buildDdsByArticle_(dds),
  };
}

function buildOpiu_(operations) {
  const opiu = operations.filter((item) => item.reportType === 'ОПиУ');
  const revenue = sumBy_(opiu, (item) => item.operation === 'Доход' ? item.amountNet : 0);
  const expenses = sumBy_(opiu, (item) => item.operation === 'Расход' ? item.amountNet : 0);
  const profit = revenue - expenses;
  const margin = revenue ? (profit / revenue) * 100 : 0;

  return {
    cards: {
      revenue,
      expenses,
      profit,
      margin,
    },
    bar: [
      { label: 'Выручка', value: revenue },
      { label: 'Расходы', value: expenses },
      { label: 'Прибыль', value: profit },
    ],
    expensesByArticle: buildArticlePie_(opiu, 'Расход', 'amountNet'),
  };
}

function buildCharts_(operations) {
  return {
    ddsByMonth: buildDdsByMonth_(operations),
    opiuByMonth: buildOpiuByMonth_(operations),
    opiuExpensesByArticle: buildArticlePie_(operations.filter((item) => item.reportType === 'ОПиУ'), 'Расход', 'amountNet'),
    ddsOutcomeByArticle: buildArticlePie_(operations.filter((item) => item.reportType === 'ДДС'), 'Списание', 'amountVat'),
    netFlowTrend: buildNetFlowTrend_(operations),
  };
}

function buildDdsByDate_(operations) {
  const grouped = {};
  operations.forEach((item) => {
    if (!grouped[item.dateIso]) {
      grouped[item.dateIso] = { key: item.dateIso, label: formatDate_(item.date), income: 0, outcome: 0, netFlow: 0 };
    }
    if (item.operation === 'Поступление') grouped[item.dateIso].income += item.amountVat;
    if (item.operation === 'Списание') grouped[item.dateIso].outcome += item.amountVat;
    grouped[item.dateIso].netFlow = grouped[item.dateIso].income - grouped[item.dateIso].outcome;
  });
  return Object.keys(grouped).sort().map((key) => grouped[key]);
}

function buildDdsByArticle_(operations) {
  const grouped = {};
  operations.forEach((item) => {
    if (!grouped[item.article]) grouped[item.article] = { label: item.article, income: 0, outcome: 0 };
    if (item.operation === 'Поступление') grouped[item.article].income += item.amountVat;
    if (item.operation === 'Списание') grouped[item.article].outcome += item.amountVat;
  });
  return Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ru')).map((key) => grouped[key]);
}

function buildDdsByMonth_(operations) {
  const dds = operations.filter((item) => item.reportType === 'ДДС');
  const grouped = {};
  dds.forEach((item) => {
    if (!grouped[item.monthKey]) {
      grouped[item.monthKey] = { key: item.monthKey, label: item.monthLabel, income: 0, outcome: 0 };
    }
    if (item.operation === 'Поступление') grouped[item.monthKey].income += item.amountVat;
    if (item.operation === 'Списание') grouped[item.monthKey].outcome += item.amountVat;
  });
  return Object.keys(grouped).sort().map((key) => grouped[key]);
}

function buildOpiuByMonth_(operations) {
  const opiu = operations.filter((item) => item.reportType === 'ОПиУ');
  const grouped = {};
  opiu.forEach((item) => {
    if (!grouped[item.monthKey]) {
      grouped[item.monthKey] = { key: item.monthKey, label: item.monthLabel, revenue: 0, expenses: 0, profit: 0 };
    }
    if (item.operation === 'Доход') grouped[item.monthKey].revenue += item.amountNet;
    if (item.operation === 'Расход') grouped[item.monthKey].expenses += item.amountNet;
    grouped[item.monthKey].profit = grouped[item.monthKey].revenue - grouped[item.monthKey].expenses;
  });
  return Object.keys(grouped).sort().map((key) => grouped[key]);
}

function buildNetFlowTrend_(operations) {
  return buildDdsByMonth_(operations).map((item) => ({
    key: item.key,
    label: item.label,
    value: item.income - item.outcome,
  }));
}

function buildArticlePie_(operations, operationName, amountField) {
  const grouped = {};
  operations.forEach((item) => {
    if (item.operation !== operationName) return;
    grouped[item.article] = (grouped[item.article] || 0) + item[amountField];
  });
  return Object.keys(grouped)
    .map((label) => ({ label, value: grouped[label] }))
    .sort((a, b) => b.value - a.value);
}

function parseDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const ru = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (ru) return new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
  }
  return null;
}

function parseAmount_(value) {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (value === null || value === '') return 0;
  const normalized = String(value).replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

function endOfDay_(date) {
  if (!date) return null;
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function sumBy_(items, getter) {
  return items.reduce((sum, item) => sum + getter(item), 0);
}

function uniqueSorted_(items) {
  return Array.from(new Set(items)).sort((a, b) => a.localeCompare(b, 'ru'));
}

function toIsoDate_(date) {
  return Utilities.formatDate(date, CONFIG.timezone, 'yyyy-MM-dd');
}

function formatDate_(date) {
  return Utilities.formatDate(date, CONFIG.timezone, 'dd.MM.yyyy');
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, CONFIG.timezone, 'dd.MM.yyyy HH:mm');
}

function errorResponse_(error) {
  return {
    ok: false,
    error: error && error.message ? error.message : 'Произошла ошибка при загрузке данных',
    filters: { wallets: [], directions: [] },
    hasData: false,
    dds: null,
    opiu: null,
    charts: null,
    notes: [],
    meta: { totalRows: 0, filteredRows: 0, loadedAt: formatDateTime_(new Date()) },
  };
}
