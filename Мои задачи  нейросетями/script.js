const storeKey = "finance-calendar-tasks-v1";
const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const longDayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const typeNames = {
  payments: "Платежи",
  reports: "Отчеты",
  taxes: "Налоги",
  calls: "Звонки",
};

const state = {
  today: startOfDay(new Date()),
  rangeStart: startOfDay(new Date()),
  monthDate: startOfMonth(new Date()),
  tasks: loadTasks(),
};

const els = {
  board: document.querySelector("#board"),
  miniCalendar: document.querySelector("#miniCalendar"),
  monthTitle: document.querySelector("#monthTitle"),
  boardTitle: document.querySelector("#boardTitle"),
  progressText: document.querySelector("#progressText"),
  doneCount: document.querySelector("#doneCount"),
  openCount: document.querySelector("#openCount"),
  todayCount: document.querySelector("#todayCount"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskDate: document.querySelector("#taskDate"),
  taskTime: document.querySelector("#taskTime"),
  taskType: document.querySelector("#taskType"),
  dialog: document.querySelector("#taskDialog"),
  editForm: document.querySelector("#editForm"),
  editId: document.querySelector("#editId"),
  editTitle: document.querySelector("#editTitle"),
  editDate: document.querySelector("#editDate"),
  editTime: document.querySelector("#editTime"),
  editType: document.querySelector("#editType"),
  editNote: document.querySelector("#editNote"),
  editDone: document.querySelector("#editDone"),
  deleteTask: document.querySelector("#deleteTask"),
};

seedTasksIfEmpty();
setDefaultInputs();
bindEvents();
render();

function bindEvents() {
  document.querySelector("#prevMonth").addEventListener("click", () => {
    state.monthDate = addMonths(state.monthDate, -1);
    renderMiniCalendar();
  });

  document.querySelector("#nextMonth").addEventListener("click", () => {
    state.monthDate = addMonths(state.monthDate, 1);
    renderMiniCalendar();
  });

  document.querySelector("#prevRange").addEventListener("click", () => {
    state.rangeStart = addDays(state.rangeStart, -14);
    state.monthDate = startOfMonth(state.rangeStart);
    render();
  });

  document.querySelector("#nextRange").addEventListener("click", () => {
    state.rangeStart = addDays(state.rangeStart, 14);
    state.monthDate = startOfMonth(state.rangeStart);
    render();
  });

  document.querySelector("#todayButton").addEventListener("click", () => {
    state.rangeStart = startOfDay(new Date());
    state.monthDate = startOfMonth(new Date());
    setDefaultInputs();
    render();
  });

  els.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.tasks.push({
      id: crypto.randomUUID(),
      title: els.taskTitle.value.trim(),
      date: els.taskDate.value,
      time: els.taskTime.value,
      type: els.taskType.value,
      note: "",
      done: false,
    });
    els.taskTitle.value = "";
    persistAndRender();
  });

  els.editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      els.dialog.close();
      return;
    }
    const task = state.tasks.find((item) => item.id === els.editId.value);
    if (!task) return;
    task.title = els.editTitle.value.trim();
    task.date = els.editDate.value;
    task.time = els.editTime.value;
    task.type = els.editType.value;
    task.note = els.editNote.value.trim();
    task.done = els.editDone.checked;
    els.dialog.close();
    persistAndRender();
  });

  els.deleteTask.addEventListener("click", () => {
    state.tasks = state.tasks.filter((item) => item.id !== els.editId.value);
    els.dialog.close();
    persistAndRender();
  });
}

function render() {
  renderBoard();
  renderMiniCalendar();
  renderStats();
}

function renderBoard() {
  const days = Array.from({ length: 14 }, (_, index) => addDays(state.rangeStart, index));
  const lastDay = days[days.length - 1];
  els.boardTitle.textContent = `${formatDateShort(days[0])} - ${formatDateShort(lastDay)}`;
  els.board.innerHTML = "";

  days.forEach((date) => {
    const iso = toISODate(date);
    const dayTasks = state.tasks
      .filter((task) => task.date === iso)
      .sort((a, b) => a.time.localeCompare(b.time));

    const column = document.createElement("section");
    column.className = "day-column";
    column.dataset.date = iso;
    column.innerHTML = `
      <div class="day-head">
        <div>
          <strong>${longDayNames[date.getDay()]}</strong>
          <span>${formatDateShort(date)}</span>
        </div>
        <div class="day-total">${dayTasks.length} задач</div>
      </div>
      <div class="tasks"></div>
    `;

    const taskArea = column.querySelector(".tasks");
    if (dayTasks.length === 0) {
      taskArea.innerHTML = `<div class="empty">Перетащите задачу сюда</div>`;
    } else {
      dayTasks.forEach((task) => taskArea.appendChild(createTaskCard(task)));
    }

    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("drag-over");
      const id = event.dataTransfer.getData("text/plain");
      const task = state.tasks.find((item) => item.id === id);
      if (task) {
        task.date = iso;
        persistAndRender();
      }
    });

    els.board.appendChild(column);
  });
}

function createTaskCard(task) {
  const card = document.createElement("article");
  card.className = `task-card ${task.type} ${task.done ? "done" : ""}`;
  card.draggable = true;
  card.dataset.id = task.id;
  card.innerHTML = `
    <div class="task-meta">
      <span class="task-time">${task.time}</span>
      <span class="task-time">${typeNames[task.type]}</span>
    </div>
    <div class="task-title">${escapeHTML(task.title)}</div>
    ${task.note ? `<div class="task-note">${escapeHTML(task.note)}</div>` : ""}
    <div class="task-actions">
      <button class="small-button done-toggle" type="button">${task.done ? "Вернуть" : "Готово"}</button>
      <button class="small-button edit-task" type="button">Править</button>
    </div>
  `;

  card.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", task.id);
  });

  card.querySelector(".done-toggle").addEventListener("click", () => {
    task.done = !task.done;
    persistAndRender();
  });

  card.querySelector(".edit-task").addEventListener("click", () => openEditDialog(task));
  card.addEventListener("dblclick", () => openEditDialog(task));
  return card;
}

function renderMiniCalendar() {
  const title = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(state.monthDate);
  els.monthTitle.textContent = title.charAt(0).toUpperCase() + title.slice(1);
  els.miniCalendar.innerHTML = "";

  const first = startOfMonth(state.monthDate);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -offset);
  const activeDates = new Set(state.tasks.map((task) => task.date));
  const rangeEnd = addDays(state.rangeStart, 13);

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const iso = toISODate(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mini-day";
    button.textContent = date.getDate();
    if (date.getMonth() !== state.monthDate.getMonth()) button.classList.add("outside");
    if (activeDates.has(iso)) button.classList.add("has-tasks");
    if (date >= state.rangeStart && date <= rangeEnd) button.classList.add("active");
    button.addEventListener("click", () => {
      state.rangeStart = startOfDay(date);
      state.monthDate = startOfMonth(date);
      els.taskDate.value = iso;
      render();
    });
    els.miniCalendar.appendChild(button);
  }
}

function renderStats() {
  const rangeEnd = addDays(state.rangeStart, 13);
  const rangeTasks = state.tasks.filter((task) => {
    const date = parseISODate(task.date);
    return date >= state.rangeStart && date <= rangeEnd;
  });
  const done = rangeTasks.filter((task) => task.done).length;
  const open = rangeTasks.length - done;
  const percent = rangeTasks.length ? Math.round((done / rangeTasks.length) * 100) : 0;

  els.progressText.textContent = `${percent}%`;
  els.doneCount.textContent = done;
  els.openCount.textContent = open;
  els.todayCount.textContent = state.tasks.filter((task) => task.date === toISODate(new Date())).length;
}

function openEditDialog(task) {
  els.editId.value = task.id;
  els.editTitle.value = task.title;
  els.editDate.value = task.date;
  els.editTime.value = task.time;
  els.editType.value = task.type;
  els.editNote.value = task.note || "";
  els.editDone.checked = task.done;
  els.dialog.showModal();
}

function persistAndRender() {
  localStorage.setItem(storeKey, JSON.stringify(state.tasks));
  render();
}

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(storeKey)) || [];
  } catch {
    return [];
  }
}

function seedTasksIfEmpty() {
  if (state.tasks.length) return;
  const today = toISODate(state.today);
  const tomorrow = toISODate(addDays(state.today, 1));
  state.tasks = [
    {
      id: crypto.randomUUID(),
      title: "Проверить входящие платежи",
      date: today,
      time: "09:30",
      type: "payments",
      note: "Банк, касса, сверка с реестром",
      done: false,
    },
    {
      id: crypto.randomUUID(),
      title: "Подготовить отчет по ДДС",
      date: today,
      time: "12:00",
      type: "reports",
      note: "Факт, план, отклонения",
      done: false,
    },
    {
      id: crypto.randomUUID(),
      title: "Уточнить счет у поставщика",
      date: tomorrow,
      time: "15:30",
      type: "calls",
      note: "",
      done: false,
    },
  ];
  localStorage.setItem(storeKey, JSON.stringify(state.tasks));
}

function setDefaultInputs() {
  els.taskDate.value = toISODate(new Date());
  els.taskTime.value = "09:00";
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return startOfDay(result);
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toISODate(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateShort(date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date).replace(".", "");
}

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}
