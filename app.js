const STORAGE_KEY = "weekly_planner_v1";
const DAYS_RU = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

const state = {
  weekStart: getMonday(new Date()),
  tasksByDate: loadTasks()
};

const board = document.getElementById("board");
const weekRange = document.getElementById("weekRange");
const daySelect = document.getElementById("daySelect");
const taskText = document.getElementById("taskText");
const addTaskBtn = document.getElementById("addTask");
const prevWeekBtn = document.getElementById("prevWeek");
const nextWeekBtn = document.getElementById("nextWeek");
const taskTemplate = document.getElementById("taskTemplate");

let dragInfo = null;

init();

function init() {
  addTaskBtn.addEventListener("click", addTaskFromQuickForm);
  taskText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTaskFromQuickForm();
  });

  prevWeekBtn.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, -7);
    render();
  });

  nextWeekBtn.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, 7);
    render();
  });

  render();
}

function render() {
  fillDaySelect();
  renderWeekLabel();
  renderBoard();
}

function renderWeekLabel() {
  const end = addDays(state.weekStart, 6);
  weekRange.textContent = `${fmtDate(state.weekStart)} - ${fmtDate(end)}`;
}

function fillDaySelect() {
  const prev = daySelect.value;
  daySelect.innerHTML = "";

  getWeekDates(state.weekStart).forEach((date, idx) => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = `${DAYS_RU[idx]} (${fmtDateShort(date)})`;
    daySelect.appendChild(option);
  });

  daySelect.value = prev && [...daySelect.options].some((o) => o.value === prev)
    ? prev
    : isoDate(new Date());

  if (!daySelect.value) daySelect.selectedIndex = 0;
}

function renderBoard() {
  board.innerHTML = "";
  const todayIso = isoDate(new Date());

  getWeekDates(state.weekStart).forEach((date, idx) => {
    const dayCol = document.createElement("section");
    dayCol.className = "day";
    if (date === todayIso) dayCol.classList.add("today");
    dayCol.dataset.date = date;

    dayCol.innerHTML = `
      <header class="day-head">
        <h3 class="day-title">${DAYS_RU[idx]}</h3>
        <p class="day-date">${fmtDateShort(date)}</p>
      </header>
      <div class="tasks"></div>
    `;

    const tasksRoot = dayCol.querySelector(".tasks");
    const tasks = state.tasksByDate[date] || [];

    if (!tasks.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Пока задач нет";
      tasksRoot.appendChild(empty);
    } else {
      tasks.forEach((task) => {
        tasksRoot.appendChild(createTaskEl(task, date));
      });
    }

    wireDropZone(dayCol, date);
    board.appendChild(dayCol);
  });
}

function createTaskEl(task, date) {
  const node = taskTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = task.id;
  node.dataset.from = date;

  const checkbox = node.querySelector(".task-check");
  const title = node.querySelector(".task-title");
  const moveBtn = node.querySelector(".move-btn");
  const deleteBtn = node.querySelector(".delete-btn");

  title.textContent = task.title;
  checkbox.checked = !!task.done;

  if (task.done) node.classList.add("done");

  checkbox.addEventListener("change", () => {
    task.done = checkbox.checked;
    persist();
    renderBoard();
  });

  deleteBtn.addEventListener("click", () => {
    state.tasksByDate[date] = (state.tasksByDate[date] || []).filter((t) => t.id !== task.id);
    persist();
    renderBoard();
  });

  moveBtn.addEventListener("click", () => {
    const target = askTargetDay(date);
    if (!target || target === date) return;
    moveTask(task.id, date, target);
  });

  node.addEventListener("dragstart", () => {
    dragInfo = { id: task.id, from: date };
    node.style.opacity = "0.45";
  });

  node.addEventListener("dragend", () => {
    dragInfo = null;
    node.style.opacity = "1";
  });

  return node;
}

function wireDropZone(dayCol, date) {
  dayCol.addEventListener("dragover", (e) => {
    e.preventDefault();
    dayCol.classList.add("drag-over");
  });

  dayCol.addEventListener("dragleave", () => {
    dayCol.classList.remove("drag-over");
  });

  dayCol.addEventListener("drop", (e) => {
    e.preventDefault();
    dayCol.classList.remove("drag-over");
    if (!dragInfo || dragInfo.from === date) return;
    moveTask(dragInfo.id, dragInfo.from, date);
  });
}

function addTaskFromQuickForm() {
  const text = taskText.value.trim();
  const date = daySelect.value;

  if (!text || !date) return;

  const task = {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: text,
    done: false
  };

  if (!state.tasksByDate[date]) state.tasksByDate[date] = [];
  state.tasksByDate[date].push(task);

  taskText.value = "";
  persist();
  renderBoard();
}

function moveTask(taskId, from, to) {
  const source = state.tasksByDate[from] || [];
  const idx = source.findIndex((t) => t.id === taskId);
  if (idx === -1) return;

  const [task] = source.splice(idx, 1);
  if (!state.tasksByDate[to]) state.tasksByDate[to] = [];
  state.tasksByDate[to].push(task);

  persist();
  renderBoard();
}

function askTargetDay(currentDate) {
  const dates = getWeekDates(state.weekStart);
  const labels = dates
    .map((d, i) => `${i + 1}. ${DAYS_RU[i]} (${fmtDateShort(d)})`)
    .join("\n");

  const choice = window.prompt(`Куда перенести задачу?\n${labels}\n\nВведите номер дня (1-7):`);
  if (!choice) return null;

  const n = Number(choice.trim());
  if (!Number.isInteger(n) || n < 1 || n > 7) return currentDate;

  return dates[n - 1];
}

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasksByDate));
}

function getWeekDates(mondayDate) {
  return Array.from({ length: 7 }, (_, i) => isoDate(addDays(mondayDate, i)));
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, count) {
  const d = new Date(date);
  d.setDate(d.getDate() + count);
  return d;
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmtDate(dateObj) {
  return dateObj.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long"
  });
}

function fmtDateShort(input) {
  const date = typeof input === "string" ? new Date(`${input}T00:00:00`) : input;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  });
}
