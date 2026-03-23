const STORAGE_KEY = "weekly_planner_compact_v1";
const LEGACY_STORAGE_KEY = "weekly_planner_v2";

const DAY_NAMES = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье"
];

const STATUS_ORDER = ["todo", "inprogress", "done"];
const STATUS_LABELS = {
  todo: "Не начато",
  inprogress: "В процессе",
  done: "Выполнено"
};

const state = {
  weekStart: getMonday(new Date()),
  tasks: [],
  occurrenceStatuses: {}
};

const ui = {
  prevWeek: document.getElementById("prevWeek"),
  nextWeek: document.getElementById("nextWeek"),
  todayWeek: document.getElementById("todayWeek"),
  weekRange: document.getElementById("weekRange"),
  weekBoard: document.getElementById("weekBoard"),
  taskForm: document.getElementById("taskForm"),
  taskTitle: document.getElementById("taskTitle"),
  taskDay: document.getElementById("taskDay"),
  taskStatus: document.getElementById("taskStatus"),
  taskColor: document.getElementById("taskColor"),
  taskRepeat: document.getElementById("taskRepeat"),
  formMessage: document.getElementById("formMessage"),
  statsPercent: document.getElementById("statsPercent"),
  statsMeta: document.getElementById("statsMeta"),
  statsFill: document.getElementById("statsFill"),
  chipTodo: document.getElementById("chipTodo"),
  chipProgress: document.getElementById("chipProgress"),
  chipDone: document.getElementById("chipDone")
};

init();

function init() {
  hydrateState();
  fillDaySelect();
  setDefaultDay();
  bindEvents();
  render();
}

function hydrateState() {
  const ownData = loadCompactData();
  if (ownData) {
    state.tasks = ownData.tasks;
    state.occurrenceStatuses = ownData.occurrenceStatuses;
    return;
  }

  const legacyData = loadLegacyData();
  if (legacyData) {
    state.tasks = legacyData.tasks;
    state.occurrenceStatuses = legacyData.occurrenceStatuses;
    persist();
    return;
  }

  const demo = createDemoData();
  state.tasks = demo.tasks;
  state.occurrenceStatuses = demo.occurrenceStatuses;
  persist();
}

function loadCompactData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;

    const tasks = parsed.tasks.map(normalizeTask).filter(Boolean);
    if (parsed.tasks.length > 0 && tasks.length === 0) return null;

    const occurrenceStatuses = isObj(parsed.occurrenceStatuses) ? parsed.occurrenceStatuses : {};
    return { tasks, occurrenceStatuses };
  } catch {
    return null;
  }
}

function loadLegacyData() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;

    const tasks = parsed.tasks
      .map((task) => {
        if (!task || typeof task !== "object") return null;
        if (typeof task.title !== "string" || !task.title.trim()) return null;
        if (!Number.isInteger(task.day) || task.day < 0 || task.day > 6) return null;

        return {
          id: String(task.id || createId()),
          title: task.title.trim(),
          day: task.day,
          color: typeof task.color === "string" && task.color ? task.color : "#3f8cff",
          repeatWeekly: Boolean(task.repeatWeekly),
          weekStartIso: typeof task.weekStartIso === "string" ? task.weekStartIso : null,
          defaultStatus: validStatus(task.defaultStatus) ? task.defaultStatus : "todo"
        };
      })
      .filter(Boolean);

    const occurrenceStatuses = isObj(parsed.occurrenceStatuses) ? parsed.occurrenceStatuses : {};
    if (!tasks.length && parsed.tasks.length) return null;

    return { tasks, occurrenceStatuses };
  } catch {
    return null;
  }
}

function createDemoData() {
  const weekIso = toIsoDate(state.weekStart);

  const tasks = [
    {
      id: createId(),
      title: "Планёрка",
      day: 0,
      color: "#3f8cff",
      repeatWeekly: true,
      weekStartIso: null,
      defaultStatus: "todo"
    },
    {
      id: createId(),
      title: "Работа с отчётами",
      day: 1,
      color: "#ff9a3d",
      repeatWeekly: false,
      weekStartIso: weekIso,
      defaultStatus: "todo"
    },
    {
      id: createId(),
      title: "Йога",
      day: 3,
      color: "#2eb179",
      repeatWeekly: true,
      weekStartIso: null,
      defaultStatus: "todo"
    },
    {
      id: createId(),
      title: "Встреча с командой",
      day: 3,
      color: "#ff6e7f",
      repeatWeekly: false,
      weekStartIso: weekIso,
      defaultStatus: "inprogress"
    },
    {
      id: createId(),
      title: "Личное время",
      day: 6,
      color: "#7b8cff",
      repeatWeekly: false,
      weekStartIso: weekIso,
      defaultStatus: "done"
    }
  ];

  const occurrenceStatuses = {};
  tasks.forEach((task) => {
    occurrenceStatuses[occurrenceKey(task.id, weekIso)] = task.defaultStatus;
  });

  return { tasks, occurrenceStatuses };
}

function bindEvents() {
  ui.prevWeek.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, -7);
    render();
  });

  ui.nextWeek.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, 7);
    render();
  });

  ui.todayWeek.addEventListener("click", () => {
    state.weekStart = getMonday(new Date());
    render();
  });

  ui.taskForm.addEventListener("submit", onAddTask);
}

function fillDaySelect() {
  ui.taskDay.innerHTML = "";
  DAY_NAMES.forEach((dayName, idx) => {
    const option = document.createElement("option");
    option.value = String(idx);
    option.textContent = dayName;
    ui.taskDay.append(option);
  });
}

function setDefaultDay() {
  ui.taskDay.value = String(getWeekDayIndex(new Date()));
}

function onAddTask(event) {
  event.preventDefault();

  const title = ui.taskTitle.value.trim();
  const day = Number(ui.taskDay.value);
  const status = ui.taskStatus.value;
  const color = ui.taskColor.value;
  const repeatWeekly = ui.taskRepeat.checked;

  if (!title) {
    setFormMessage("Введите название задачи", true);
    return;
  }

  if (!Number.isInteger(day) || day < 0 || day > 6) {
    setFormMessage("Выберите день недели", true);
    return;
  }

  if (!validStatus(status)) {
    setFormMessage("Некорректный статус", true);
    return;
  }

  const weekIso = toIsoDate(state.weekStart);
  const task = {
    id: createId(),
    title,
    day,
    color,
    repeatWeekly,
    weekStartIso: repeatWeekly ? null : weekIso,
    defaultStatus: "todo"
  };

  state.tasks.push(task);
  state.occurrenceStatuses[occurrenceKey(task.id, weekIso)] = status;
  persist();
  render();

  ui.taskForm.reset();
  ui.taskColor.value = "#3f8cff";
  ui.taskStatus.value = "todo";
  setDefaultDay();
  setFormMessage("Задача добавлена");
}

function render() {
  const weekIso = toIsoDate(state.weekStart);
  const tasks = tasksForWeek(weekIso);

  renderWeekRange();
  renderBoard(tasks, weekIso);
  renderStats(tasks);
}

function renderWeekRange() {
  const end = addDays(state.weekStart, 6);
  ui.weekRange.textContent = `${formatDateLong(state.weekStart)} - ${formatDateLong(end)}`;
}

function tasksForWeek(weekIso) {
  return state.tasks
    .filter((task) => task.repeatWeekly || task.weekStartIso === weekIso)
    .map((task) => ({
      ...task,
      status: getOccurrenceStatus(task, weekIso)
    }))
    .sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, "ru"));
}

function getOccurrenceStatus(task, weekIso) {
  const key = occurrenceKey(task.id, weekIso);
  return validStatus(state.occurrenceStatuses[key]) ? state.occurrenceStatuses[key] : (task.defaultStatus || "todo");
}

function renderBoard(tasks, weekIso) {
  ui.weekBoard.innerHTML = "";

  const byDay = groupByDay(tasks);
  const weekDates = getWeekDates(state.weekStart);
  const todayIso = toIsoDate(new Date());

  weekDates.forEach((date, dayIndex) => {
    const tile = document.createElement("section");
    tile.className = "day-tile";
    if (toIsoDate(date) === todayIso) tile.classList.add("today");

    const head = document.createElement("header");
    head.className = "day-head";

    const title = document.createElement("strong");
    title.textContent = DAY_NAMES[dayIndex];

    const dateText = document.createElement("span");
    dateText.textContent = formatDateShort(date);

    head.append(title, dateText);

    const list = document.createElement("div");
    list.className = "task-list";

    const dayTasks = byDay[dayIndex] || [];
    if (!dayTasks.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Нет задач";
      list.append(empty);
    } else {
      dayTasks.forEach((task) => {
        list.append(createTaskNode(task, weekIso));
      });
    }

    tile.append(head, list);
    ui.weekBoard.append(tile);
  });
}

function createTaskNode(task, weekIso) {
  const card = document.createElement("article");
  card.className = `task-item status-${task.status}`;
  card.style.borderLeftColor = task.color;

  const main = document.createElement("div");
  main.className = "task-main";

  const title = document.createElement("h3");
  title.className = "task-title";
  title.textContent = task.title;

  const note = document.createElement("p");
  note.className = "task-note";
  note.textContent = task.repeatWeekly ? "Еженедельно" : "Разовая";

  main.append(title, note);

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const statusBtn = document.createElement("button");
  statusBtn.className = "status-btn";
  statusBtn.type = "button";
  statusBtn.textContent = STATUS_LABELS[task.status];
  statusBtn.addEventListener("click", () => {
    const nextStatus = rotateStatus(task.status);
    state.occurrenceStatuses[occurrenceKey(task.id, weekIso)] = nextStatus;
    persist();
    render();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.type = "button";
  deleteBtn.title = "Удалить";
  deleteBtn.textContent = "×";
  deleteBtn.addEventListener("click", () => {
    removeTask(task.id);
  });

  actions.append(statusBtn, deleteBtn);

  card.append(main, actions);
  return card;
}

function renderStats(tasks) {
  const counts = { todo: 0, inprogress: 0, done: 0 };
  tasks.forEach((task) => {
    counts[task.status] += 1;
  });

  const total = tasks.length;
  const done = counts.done;
  const percent = total ? Math.round((done / total) * 100) : 0;

  ui.statsPercent.textContent = `${percent}%`;
  ui.statsMeta.textContent = `${done} из ${total}`;
  ui.statsFill.style.width = `${percent}%`;

  ui.chipTodo.textContent = `Не начато: ${counts.todo}`;
  ui.chipProgress.textContent = `В процессе: ${counts.inprogress}`;
  ui.chipDone.textContent = `Выполнено: ${counts.done}`;
}

function removeTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);

  const prefix = `${taskId}__`;
  Object.keys(state.occurrenceStatuses).forEach((key) => {
    if (key.startsWith(prefix)) delete state.occurrenceStatuses[key];
  });

  persist();
  render();
}

function rotateStatus(status) {
  const currentIndex = STATUS_ORDER.indexOf(status);
  const nextIndex = (currentIndex + 1) % STATUS_ORDER.length;
  return STATUS_ORDER[nextIndex];
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tasks: state.tasks,
    occurrenceStatuses: state.occurrenceStatuses
  }));
}

function normalizeTask(task) {
  if (!task || typeof task !== "object") return null;
  if (typeof task.title !== "string" || !task.title.trim()) return null;
  if (!Number.isInteger(task.day) || task.day < 0 || task.day > 6) return null;

  return {
    id: String(task.id || createId()),
    title: task.title.trim(),
    day: task.day,
    color: typeof task.color === "string" && task.color ? task.color : "#3f8cff",
    repeatWeekly: Boolean(task.repeatWeekly),
    weekStartIso: typeof task.weekStartIso === "string" ? task.weekStartIso : null,
    defaultStatus: validStatus(task.defaultStatus) ? task.defaultStatus : "todo"
  };
}

function validStatus(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status);
}

function groupByDay(tasks) {
  return tasks.reduce((acc, task) => {
    if (!acc[task.day]) acc[task.day] = [];
    acc[task.day].push(task);
    return acc;
  }, {});
}

function setFormMessage(message, isError = false) {
  ui.formMessage.textContent = message;
  ui.formMessage.classList.toggle("error", isError);
}

function occurrenceKey(taskId, weekIso) {
  return `${taskId}__${weekIso}`;
}

function getWeekDates(monday) {
  return Array.from({ length: 7 }, (_, idx) => addDays(monday, idx));
}

function getWeekDayIndex(date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + shift);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, delta) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + delta);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateShort(date) {
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  });
}

function formatDateLong(date) {
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function isObj(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function createId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
