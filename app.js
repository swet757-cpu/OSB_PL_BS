const STORAGE_KEY = "weekly_planner_v2";
const DAY_NAMES = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье"
];

const STATUS_META = {
  todo: { label: "Не начато" },
  inprogress: { label: "В процессе" },
  done: { label: "Выполнено" }
};

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const DAY_START_MIN = DAY_START_HOUR * 60;
const DAY_END_MIN = DAY_END_HOUR * 60;

const state = {
  weekStart: getMonday(new Date()),
  tasks: [],
  occurrenceStatuses: {}
};

const elements = {
  weekGrid: document.getElementById("weekGrid"),
  weekRange: document.getElementById("weekRange"),
  prevWeek: document.getElementById("prevWeek"),
  nextWeek: document.getElementById("nextWeek"),
  todayWeek: document.getElementById("todayWeek"),
  taskForm: document.getElementById("taskForm"),
  taskTitle: document.getElementById("taskTitle"),
  taskDay: document.getElementById("taskDay"),
  taskStart: document.getElementById("taskStart"),
  taskEnd: document.getElementById("taskEnd"),
  taskColor: document.getElementById("taskColor"),
  taskDescription: document.getElementById("taskDescription"),
  taskStatus: document.getElementById("taskStatus"),
  taskRepeat: document.getElementById("taskRepeat"),
  formMessage: document.getElementById("formMessage"),
  totalTasks: document.getElementById("totalTasks"),
  doneTasks: document.getElementById("doneTasks"),
  plannedHours: document.getElementById("plannedHours"),
  overlapCount: document.getElementById("overlapCount"),
  progressPercent: document.getElementById("progressPercent"),
  progressFill: document.getElementById("progressFill"),
  progressMeta: document.getElementById("progressMeta"),
  barTodo: document.getElementById("barTodo"),
  barProgress: document.getElementById("barProgress"),
  barDone: document.getElementById("barDone"),
  countTodo: document.getElementById("countTodo"),
  countProgress: document.getElementById("countProgress"),
  countDone: document.getElementById("countDone"),
  busiestDay: document.getElementById("busiestDay")
};

init();

function init() {
  hydrateState();
  fillDaySelect();
  setDefaultDayForForm();
  bindEvents();
  render();
}

function bindEvents() {
  elements.prevWeek.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, -7);
    render();
  });

  elements.nextWeek.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, 7);
    render();
  });

  elements.todayWeek.addEventListener("click", () => {
    state.weekStart = getMonday(new Date());
    render();
  });

  elements.taskForm.addEventListener("submit", onAddTask);
}

function hydrateState() {
  const loaded = loadFromStorage();
  if (!loaded) {
    const demo = createDemoData();
    state.tasks = demo.tasks;
    state.occurrenceStatuses = demo.occurrenceStatuses;
    persist();
    return;
  }

  state.tasks = loaded.tasks;
  state.occurrenceStatuses = loaded.occurrenceStatuses;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;

    const normalizedTasks = parsed.tasks
      .map(normalizeTask)
      .filter(Boolean);

    if (parsed.tasks.length > 0 && normalizedTasks.length === 0) return null;

    const occurrenceStatuses = typeof parsed.occurrenceStatuses === "object" && parsed.occurrenceStatuses
      ? parsed.occurrenceStatuses
      : {};

    return {
      tasks: normalizedTasks,
      occurrenceStatuses
    };
  } catch {
    return null;
  }
}

function normalizeTask(task) {
  if (!task || typeof task !== "object") return null;
  if (typeof task.title !== "string" || !task.title.trim()) return null;
  if (!Number.isInteger(task.day) || task.day < 0 || task.day > 6) return null;

  const startMin = Number(task.startMin);
  const endMin = Number(task.endMin);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin) return null;

  return {
    id: String(task.id || createId()),
    title: task.title.trim(),
    day: task.day,
    startMin,
    endMin,
    color: typeof task.color === "string" && task.color ? task.color : "#3f8cff",
    description: typeof task.description === "string" ? task.description.trim() : "",
    repeatWeekly: Boolean(task.repeatWeekly),
    weekStartIso: typeof task.weekStartIso === "string" ? task.weekStartIso : null,
    defaultStatus: isValidStatus(task.defaultStatus) ? task.defaultStatus : "todo"
  };
}

function createDemoData() {
  const weekIso = toIsoDate(state.weekStart);

  const planner = {
    id: createId(),
    title: "Планёрка",
    day: 0,
    startMin: toMinutes("10:00"),
    endMin: toMinutes("11:00"),
    color: "#3f8cff",
    description: "Синхронизация команды и приоритеты на неделю",
    repeatWeekly: true,
    weekStartIso: null,
    defaultStatus: "todo"
  };

  const yoga = {
    id: createId(),
    title: "Йога",
    day: 3,
    startMin: toMinutes("19:00"),
    endMin: toMinutes("20:00"),
    color: "#14b298",
    description: "Вечерняя практика и восстановление",
    repeatWeekly: true,
    weekStartIso: null,
    defaultStatus: "todo"
  };

  const reports = {
    id: createId(),
    title: "Работа с отчётами",
    day: 1,
    startMin: toMinutes("14:00"),
    endMin: toMinutes("16:00"),
    color: "#ff9a3d",
    description: "Свести показатели и подготовить комментарии",
    repeatWeekly: false,
    weekStartIso: weekIso,
    defaultStatus: "todo"
  };

  const teamMeet = {
    id: createId(),
    title: "Встреча с командой",
    day: 3,
    startMin: toMinutes("19:30"),
    endMin: toMinutes("20:30"),
    color: "#ff6d7d",
    description: "Проверка пересечения задач и обсуждение статусов",
    repeatWeekly: false,
    weekStartIso: weekIso,
    defaultStatus: "todo"
  };

  const personal = {
    id: createId(),
    title: "Личное время",
    day: 6,
    startMin: toMinutes("12:00"),
    endMin: toMinutes("14:00"),
    color: "#7b8cff",
    description: "Отдых, прогулка и перезагрузка",
    repeatWeekly: false,
    weekStartIso: weekIso,
    defaultStatus: "todo"
  };

  const tasks = [planner, yoga, reports, teamMeet, personal];

  const occurrenceStatuses = {
    [occurrenceKey(planner.id, weekIso)]: "inprogress",
    [occurrenceKey(yoga.id, weekIso)]: "todo",
    [occurrenceKey(reports.id, weekIso)]: "todo",
    [occurrenceKey(teamMeet.id, weekIso)]: "todo",
    [occurrenceKey(personal.id, weekIso)]: "done"
  };

  return { tasks, occurrenceStatuses };
}

function fillDaySelect() {
  elements.taskDay.innerHTML = "";
  DAY_NAMES.forEach((name, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = name;
    elements.taskDay.append(option);
  });
}

function setDefaultDayForForm() {
  const todayIndex = getWeekDayIndex(new Date());
  elements.taskDay.value = String(todayIndex);
}

function onAddTask(event) {
  event.preventDefault();

  const title = elements.taskTitle.value.trim();
  const day = Number(elements.taskDay.value);
  const startValue = elements.taskStart.value;
  const endValue = elements.taskEnd.value;
  const color = elements.taskColor.value;
  const description = elements.taskDescription.value.trim();
  const status = elements.taskStatus.value;
  const repeatWeekly = elements.taskRepeat.checked;

  if (!title) {
    setFormMessage("Введите название задачи.", true);
    return;
  }

  if (!Number.isInteger(day) || day < 0 || day > 6) {
    setFormMessage("Выберите день недели.", true);
    return;
  }

  const startMin = toMinutes(startValue);
  const endMin = toMinutes(endValue);

  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    setFormMessage("Проверьте время начала и окончания.", true);
    return;
  }

  if (endMin <= startMin) {
    setFormMessage("Время окончания должно быть позже времени начала.", true);
    return;
  }

  if (!isValidStatus(status)) {
    setFormMessage("Некорректный статус задачи.", true);
    return;
  }

  const weekIso = toIsoDate(state.weekStart);
  const task = {
    id: createId(),
    title,
    day,
    startMin,
    endMin,
    color,
    description,
    repeatWeekly,
    weekStartIso: repeatWeekly ? null : weekIso,
    defaultStatus: "todo"
  };

  state.tasks.push(task);
  state.occurrenceStatuses[occurrenceKey(task.id, weekIso)] = status;

  persist();
  render();

  elements.taskForm.reset();
  elements.taskColor.value = "#3f8cff";
  elements.taskStart.value = "09:00";
  elements.taskEnd.value = "10:00";
  elements.taskStatus.value = "todo";
  setDefaultDayForForm();
  setFormMessage("Задача добавлена.");
}

function setFormMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.classList.toggle("error", isError);
}

function render() {
  const currentWeekIso = toIsoDate(state.weekStart);
  const tasksForWeek = getTasksForWeek(currentWeekIso);

  renderWeekRange();
  renderWeekGrid(tasksForWeek, currentWeekIso);
  renderDashboard(tasksForWeek);
}

function renderWeekRange() {
  const endWeek = addDays(state.weekStart, 6);
  elements.weekRange.textContent = `${formatDateLong(state.weekStart)} - ${formatDateLong(endWeek)}`;
}

function getTasksForWeek(weekIso) {
  return state.tasks
    .filter((task) => task.repeatWeekly || task.weekStartIso === weekIso)
    .map((task) => ({
      ...task,
      status: getOccurrenceStatus(task, weekIso)
    }))
    .sort((a, b) => a.day - b.day || a.startMin - b.startMin || a.endMin - b.endMin);
}

function getOccurrenceStatus(task, weekIso) {
  const key = occurrenceKey(task.id, weekIso);
  if (isValidStatus(state.occurrenceStatuses[key])) return state.occurrenceStatuses[key];
  return isValidStatus(task.defaultStatus) ? task.defaultStatus : "todo";
}

function renderWeekGrid(tasks, weekIso) {
  elements.weekGrid.innerHTML = "";

  const weekDates = getWeekDates(state.weekStart);
  const todayIso = toIsoDate(new Date());
  const tasksByDay = splitByDay(tasks);

  const cornerCell = document.createElement("div");
  cornerCell.className = "corner-cell";
  cornerCell.textContent = "Время";
  elements.weekGrid.append(cornerCell);

  weekDates.forEach((date, dayIndex) => {
    const dateIso = toIsoDate(date);
    const header = document.createElement("div");
    header.className = "day-header";
    if (dateIso === todayIso) header.classList.add("today");

    const dayTitle = document.createElement("strong");
    dayTitle.textContent = DAY_NAMES[dayIndex];

    const dateText = document.createElement("span");
    dateText.textContent = formatDateShort(date);

    header.append(dayTitle, dateText);
    elements.weekGrid.append(header);
  });

  elements.weekGrid.append(createTimeAxis());

  weekDates.forEach((date, dayIndex) => {
    const dateIso = toIsoDate(date);
    const dayColumn = document.createElement("div");
    dayColumn.className = "day-column";
    if (dateIso === todayIso) dayColumn.classList.add("today");

    const dayTrack = document.createElement("div");
    dayTrack.className = "day-track";

    const dayTasks = layoutOverlaps(tasksByDay[dayIndex] || []);

    if (!dayTasks.length) {
      const empty = document.createElement("span");
      empty.className = "empty-day";
      empty.textContent = "Нет задач";
      dayTrack.append(empty);
    }

    dayTasks.forEach((task) => {
      const eventCard = createEventCard(task, weekIso);
      if (eventCard) dayTrack.append(eventCard);
    });

    if (dateIso === todayIso) {
      appendNowLine(dayTrack);
    }

    dayColumn.append(dayTrack);
    elements.weekGrid.append(dayColumn);
  });
}

function createTimeAxis() {
  const axis = document.createElement("div");
  axis.className = "time-axis";

  const hourHeight = getHourHeightPx();

  for (let hour = DAY_START_HOUR; hour <= DAY_END_HOUR; hour += 1) {
    const label = document.createElement("span");
    label.className = "time-label";
    label.textContent = `${String(hour).padStart(2, "0")}:00`;
    label.style.top = `${(hour - DAY_START_HOUR) * hourHeight}px`;
    axis.append(label);
  }

  return axis;
}

function createEventCard(task, weekIso) {
  const visibleStart = Math.max(task.startMin, DAY_START_MIN);
  const visibleEnd = Math.min(task.endMin, DAY_END_MIN);
  if (visibleEnd <= DAY_START_MIN || visibleStart >= DAY_END_MIN || visibleEnd <= visibleStart) {
    return null;
  }

  const hourHeight = getHourHeightPx();
  const pxPerMinute = hourHeight / 60;

  const top = (visibleStart - DAY_START_MIN) * pxPerMinute;
  const height = Math.max((visibleEnd - visibleStart) * pxPerMinute, 42);

  const widthShare = 100 / task.columns;
  const leftShare = widthShare * task.column;

  const card = document.createElement("article");
  card.className = `event-card status-${task.status}`;
  if (height < 88) card.classList.add("compact");

  card.style.top = `${top}px`;
  card.style.height = `${height}px`;
  card.style.left = `calc(${leftShare}% + 3px)`;
  card.style.width = `calc(${widthShare}% - 6px)`;
  card.style.background = buildCardBackground(task.color, task.status === "done");
  card.style.borderColor = hexToRgba(task.color, 0.36);

  const head = document.createElement("div");
  head.className = "event-head";

  const title = document.createElement("h4");
  title.className = "event-title";
  title.textContent = task.title;

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "event-delete";
  deleteBtn.type = "button";
  deleteBtn.title = "Удалить задачу";
  deleteBtn.textContent = "×";
  deleteBtn.addEventListener("click", () => {
    deleteTask(task.id);
  });

  head.append(title, deleteBtn);

  const time = document.createElement("p");
  time.className = "event-time";
  time.textContent = `${toTime(task.startMin)} - ${toTime(task.endMin)}`;

  const description = document.createElement("p");
  description.className = "event-desc";
  description.textContent = task.description || "Без описания";

  const footer = document.createElement("div");
  footer.className = "event-footer";

  const badge = document.createElement("span");
  badge.className = "event-badge";
  badge.textContent = task.repeatWeekly ? "Еженедельно" : "Разовая";

  const statusSelect = document.createElement("select");
  statusSelect.className = "status-select";

  Object.entries(STATUS_META).forEach(([value, meta]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = meta.label;
    statusSelect.append(option);
  });

  statusSelect.value = task.status;
  statusSelect.addEventListener("change", () => {
    state.occurrenceStatuses[occurrenceKey(task.id, weekIso)] = statusSelect.value;
    persist();
    render();
  });

  footer.append(badge, statusSelect);

  card.append(head, time, description, footer);
  return card;
}

function appendNowLine(track) {
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  if (minutesNow < DAY_START_MIN || minutesNow > DAY_END_MIN) return;

  const hourHeight = getHourHeightPx();
  const pxPerMinute = hourHeight / 60;
  const top = (minutesNow - DAY_START_MIN) * pxPerMinute;

  const line = document.createElement("div");
  line.className = "now-line";
  line.style.top = `${top}px`;

  const label = document.createElement("span");
  label.className = "now-label";
  label.textContent = "Сейчас";

  line.append(label);
  track.append(line);
}

function layoutOverlaps(tasks) {
  if (!tasks.length) return [];

  const sorted = [...tasks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result = [];

  let group = [];
  let groupEnd = -1;

  sorted.forEach((task) => {
    if (!group.length) {
      group = [task];
      groupEnd = task.endMin;
      return;
    }

    if (task.startMin < groupEnd) {
      group.push(task);
      groupEnd = Math.max(groupEnd, task.endMin);
      return;
    }

    result.push(...assignColumns(group));
    group = [task];
    groupEnd = task.endMin;
  });

  if (group.length) {
    result.push(...assignColumns(group));
  }

  return result;
}

function assignColumns(groupTasks) {
  const arranged = groupTasks.map((task) => ({ ...task, column: 0, columns: 1 }));
  const active = [];
  let maxColumns = 1;

  arranged.forEach((task) => {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (active[i].endMin <= task.startMin) active.splice(i, 1);
    }

    const used = new Set(active.map((item) => item.column));
    let column = 0;
    while (used.has(column)) column += 1;

    task.column = column;
    active.push(task);

    maxColumns = Math.max(maxColumns, active.length, column + 1);
  });

  arranged.forEach((task) => {
    task.columns = maxColumns;
  });

  return arranged;
}

function renderDashboard(tasks) {
  const total = tasks.length;
  const counts = { todo: 0, inprogress: 0, done: 0 };

  tasks.forEach((task) => {
    counts[task.status] += 1;
  });

  const done = counts.done;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const plannedMinutes = tasks.reduce((sum, task) => sum + (task.endMin - task.startMin), 0);
  const overlapPairs = countOverlaps(tasks);

  elements.totalTasks.textContent = String(total);
  elements.doneTasks.textContent = String(done);
  elements.plannedHours.textContent = formatHours(plannedMinutes);
  elements.overlapCount.textContent = String(overlapPairs);

  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;
  elements.progressMeta.textContent = `${done} из ${total} задач выполнено`;

  elements.countTodo.textContent = String(counts.todo);
  elements.countProgress.textContent = String(counts.inprogress);
  elements.countDone.textContent = String(counts.done);

  elements.barTodo.style.width = `${total ? (counts.todo / total) * 100 : 0}%`;
  elements.barProgress.style.width = `${total ? (counts.inprogress / total) * 100 : 0}%`;
  elements.barDone.style.width = `${total ? (counts.done / total) * 100 : 0}%`;

  const busiest = busiestDaySummary(tasks);
  elements.busiestDay.textContent = busiest;
}

function busiestDaySummary(tasks) {
  const counts = new Array(7).fill(0);
  tasks.forEach((task) => {
    counts[task.day] += 1;
  });

  let bestDay = -1;
  let bestCount = 0;

  counts.forEach((count, day) => {
    if (count > bestCount) {
      bestCount = count;
      bestDay = day;
    }
  });

  if (bestDay === -1) return "Самый загруженный день: задач пока нет.";

  return `Самый загруженный день: ${DAY_NAMES[bestDay]} (${bestCount}).`;
}

function countOverlaps(tasks) {
  const grouped = splitByDay(tasks);
  let overlaps = 0;

  Object.values(grouped).forEach((dayTasks) => {
    const sorted = [...dayTasks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        if (sorted[j].startMin >= sorted[i].endMin) break;
        if (isOverlapping(sorted[i], sorted[j])) overlaps += 1;
      }
    }
  });

  return overlaps;
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);

  const prefix = `${taskId}__`;
  Object.keys(state.occurrenceStatuses).forEach((key) => {
    if (key.startsWith(prefix)) {
      delete state.occurrenceStatuses[key];
    }
  });

  persist();
  render();
}

function splitByDay(tasks) {
  return tasks.reduce((acc, task) => {
    if (!acc[task.day]) acc[task.day] = [];
    acc[task.day].push(task);
    return acc;
  }, {});
}

function buildCardBackground(hex, isDone) {
  const top = hexToRgba(hex, isDone ? 0.26 : 0.36);
  const bottom = hexToRgba(hex, isDone ? 0.12 : 0.2);
  return `linear-gradient(160deg, ${top} 0%, ${bottom} 100%)`;
}

function persist() {
  const payload = {
    tasks: state.tasks,
    occurrenceStatuses: state.occurrenceStatuses
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function isOverlapping(a, b) {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function isValidStatus(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_META, status);
}

function getHourHeightPx() {
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue("--hour-height");
  const parsed = Number.parseFloat(cssValue);
  return Number.isFinite(parsed) ? parsed : 64;
}

function toMinutes(time) {
  if (typeof time !== "string" || !time.includes(":")) return NaN;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return NaN;
  return h * 60 + m;
}

function toTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatHours(minutes) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function occurrenceKey(taskId, weekIso) {
  return `${taskId}__${weekIso}`;
}

function getWeekDates(monday) {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function getWeekDayIndex(date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
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

function hexToRgba(hex, alpha) {
  const safeHex = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(safeHex)) return `rgba(63, 140, 255, ${alpha})`;

  const r = Number.parseInt(safeHex.slice(0, 2), 16);
  const g = Number.parseInt(safeHex.slice(2, 4), 16);
  const b = Number.parseInt(safeHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
