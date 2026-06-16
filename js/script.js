const userId = localStorage.getItem("userId");

if (!userId) {
  window.location.href = "first-setup.html";
}

const API = "http://localhost:5000/api";

// ===================== POPUP =====================

const overlay = document.getElementById("popup-overlay");
const msgEl = document.getElementById("popup-message");
const inputEl = document.getElementById("popup-input");
const btnOk = document.getElementById("popup-btn-ok");
const btnCancel = document.getElementById("popup-btn-cancel");

function showAlert(message) {
  msgEl.textContent = message;
  inputEl.classList.add("hidden");
  btnCancel.classList.add("hidden");
  overlay.classList.remove("hidden");
  return new Promise((resolve) => {
    btnOk.onclick = () => {
      overlay.classList.add("hidden");
      resolve();
    };
  });
}

function showPrompt(message) {
  msgEl.textContent = message;
  inputEl.value = "";
  inputEl.classList.remove("hidden");
  btnCancel.classList.remove("hidden");
  overlay.classList.remove("hidden");
  return new Promise((resolve) => {
    btnOk.onclick = () => {
      const value = inputEl.value.trim();
      overlay.classList.add("hidden");
      resolve(value === "" ? null : value);
    };
    btnCancel.onclick = () => {
      overlay.classList.add("hidden");
      resolve(null);
    };
  });
}

function showConfirm(message) {
  msgEl.textContent = message;
  inputEl.classList.add("hidden");
  btnCancel.classList.remove("hidden");
  overlay.classList.remove("hidden");
  return new Promise((resolve) => {
    btnOk.onclick = () => {
      overlay.classList.add("hidden");
      resolve(true);
    };
    btnCancel.onclick = () => {
      overlay.classList.add("hidden");
      resolve(false);
    };
  });
}

// ===================== DASHBOARD =====================

let goalSum = 0;

function renderProgress(balance, goalSum) {
  const pct = Math.min(100, (balance / goalSum) * 100).toFixed(1);
  document.getElementById("progress-bar-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent =
    "Баланс: " + balance.toFixed(2) + " грн (" + pct + "%)";
  document.getElementById("progress-goal").textContent =
    "Ціль: " + goalSum + " грн";
}

function renderUser(user) {
  const emojis = ["😎", "✌️", "😋", "😊", "😉", "🤑", "😇", "👀"];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  document.querySelector(".user-name").textContent = user.name + " " + emoji;

  let now = new Date();
  if (user.simulation_date) {
    now = new Date(user.simulation_date);
  }

  const [startDay, startMonth] = user.startDate.split(".").map(Number);
  const startDate = new Date(now.getFullYear(), startMonth - 1, startDay);

  const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

  const diffMs = todayDateOnly - startDateOnly;
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  const dailyIncome =
    (user.parents_daily || 0) +
    (user.other_amount || 0) -
    (user.must_spend || 0);

  goalSum = user.goal_sum;

  const dashboard = document.querySelector(".dashboard");
  dashboard.innerHTML = `
        <div class="card">
            <p class="card__label">Мета</p>
            <p class="card__value">${user.goal}</p>
        </div>
        <div class="card">
            <p class="card__label">Сума мрії</p>
            <p class="card__value">${user.goal_sum} грн</p>
        </div>
        <div class="card">
            <p class="card__label">Термін</p>
            <p class="card__value">${user.deadline} днів</p>
        </div>
        <div class="card">
            <p class="card__label">Дні</p>
            <p class="card__value">${diffDays}/${user.deadline}</p>
        </div>
        <div class="card">
            <p class="card__label">Денний дохід</p>
            <p class="card__value">${dailyIncome.toFixed(2)} грн/день</p>
        </div>
        <div class="card">
            <p class="card__label">Залишок до мети</p>
            <p class="card__value" id="remaining-amount">завантаження...</p>
        </div>
        <div class="card">
            <p class="card__label">Останній день</p>
            <p class="card__value" id="last-day">
                    ${new Date(
    startDateOnly.getTime() +
    user.deadline * 24 * 60 * 60 * 1000,
  ).toLocaleDateString("uk-UA")}
        </p>
        </div>
    `;

  document.getElementById("profile-name").textContent = user.name;
  const avatarEl = document.getElementById("profile-avatar");
  const previewEl = document.getElementById("avatar-preview");
  const placeholder =
    "https://ui-avatars.com/api/?name=" +
    encodeURIComponent(user.name) +
    "&background=ffffff&color=5957DB&size=128";
  avatarEl.src = user.avatar || placeholder;
  avatarEl.classList.remove("hidden");
  previewEl.src = user.avatar || placeholder;

  const navSim = document.getElementById("nav-simulator");
  if (user.simulation_date) {
    navSim.classList.remove("hidden");
    const simDateDisplay = document.getElementById("sim-date-display");
    if (simDateDisplay) {
      simDateDisplay.textContent = "Дата симуляції: " + user.simulation_date;
    }
  } else {
    navSim.classList.add("hidden");
  }

  return dailyIncome;
}

let balanceChartInstance = null;

async function renderBalanceChart() {
  const res = await fetch(API + "/user/" + userId + "/stats/history");
  const data = await res.json();

  if (!data.length) return;

  // накопичуємо баланс
  let running = 0;
  const labels = [];
  const balances = [];
  const incomes = [];
  const expenses = [];

  data.forEach((row) => {
    running += row.day_change;
    labels.push(row.date.slice(5)); // MM-DD
    balances.push(+running.toFixed(2));
    if (row.day_change >= 0) {
      incomes.push(+row.day_change.toFixed(2));
      expenses.push(0);
    } else {
      incomes.push(0);
      expenses.push(+Math.abs(row.day_change).toFixed(2));
    }
  });

  const ctx = document.getElementById("balance-chart");
  if (!ctx) return;

  if (balanceChartInstance) {
    balanceChartInstance.destroy();
  }

  balanceChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Дохід",
          data: incomes,
          backgroundColor: "rgba(67,208,0,0.7)",
          borderRadius: 4,
          order: 2,
        },
        {
          label: "Витрати",
          data: expenses,
          backgroundColor: "rgba(229,57,53,0.7)",
          borderRadius: 4,
          order: 2,
        },
        {
          label: "Баланс",
          data: balances,
          type: "line",
          borderColor: "#5957DB",
          backgroundColor: "rgba(89,87,219,0.1)",
          pointRadius: 3,
          tension: 0.3,
          fill: true,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top" },
      },
      scales: {
        y: { beginAtZero: false },
      },
    },
  });
}

async function renderTodayStats(dailyIncome) {
  const res = await fetch(API + "/user/" + userId + "/stats/today");
  const data = await res.json();

  const todayExpenses = data.today_expenses || 0;
  const todayIncome = dailyIncome + (data.today_one_time_income || 0);
  const profit = todayIncome - todayExpenses;

  const expEl = document.getElementById("stat-today-expenses");
  const profitEl = document.getElementById("stat-today-profit");

  if (expEl) expEl.textContent = todayExpenses.toFixed(2) + " грн";
  if (profitEl) {
    profitEl.textContent = profit.toFixed(2) + " грн";
    profitEl.style.color = profit >= 0 ? "#43D000" : "#e53935";
  }
}

async function loadUserData() {
  const [userRes, balanceRes] = await Promise.all([
    fetch(API + "/user/" + userId),
    fetch(API + "/user/" + userId + "/balance"),
  ]);

  if (!userRes.ok) {
    localStorage.removeItem("userId");
    window.location.href = "first-setup.html";
    return;
  }

  const user = await userRes.json();
  const balance = await balanceRes.json();

  const dailyIncome = renderUser(user);
  renderProgress(balance.balance, user.goal_sum);

  document.getElementById("remaining-amount").textContent =
    (user.goal_sum - balance.balance).toFixed(2) + " грн";

  if (user.goal_sum - balance.balance <= 0) {
    try {
      const response = await fetch(
        `${API}/user/${userId}/expenses`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title: "Досягнення мрії",
            category: "інше",
            amount: Number(user.goal_sum),
            repeat_type: "одноразово"
          })
        }
      );
    } catch (error) {
      console.error("Помилка при додаванні витрати:", error);
    }
    await showAlert("Вітаємо! Ви досягли своєї мети! Не забудьте змінити мету в налаштуваннях.");
  }
  await Promise.all([renderTodayStats(dailyIncome), renderBalanceChart()]);
}

loadUserData();

// ===================== НАВІГАЦІЯ =====================

const leftPanel = document.getElementById("left-panel");
const burgerMenu = document.getElementById("burger-menu");
const closeMenuBtn = document.getElementById("btn-close-menu");
const menuOverlay = document.getElementById("menu-overlay");

function toggleMenu() {
  leftPanel.classList.toggle("open");
  menuOverlay.classList.toggle("open");
  burgerMenu.classList.toggle("open");
}

function closeMenu() {
  leftPanel.classList.remove("open");
  menuOverlay.classList.remove("open");
  burgerMenu.classList.remove("open");
}

if (burgerMenu) {
  burgerMenu.addEventListener("click", toggleMenu);
}
if (closeMenuBtn) {
  closeMenuBtn.addEventListener("click", closeMenu);
}
if (menuOverlay) {
  menuOverlay.addEventListener("click", closeMenu);
}

function showPage(pageId, navId) {
  ["page-dashboard", "page-expenses", "page-income", "page-simulator"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  ["nav-dashboard", "nav-expenses", "nav-income", "nav-simulator"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
  });
  const pageEl = document.getElementById(pageId);
  const navEl = document.getElementById(navId);
  if (pageEl) pageEl.classList.remove("hidden");
  if (navEl) navEl.classList.add("active");
  
  closeMenu();
}

document.getElementById("nav-dashboard").addEventListener("click", () => {
  showPage("page-dashboard", "nav-dashboard");
  renderBalanceChart();
});

document.getElementById("nav-expenses").addEventListener("click", () => {
  showPage("page-expenses", "nav-expenses");
  loadExpenses();
});

document.getElementById("nav-income").addEventListener("click", () => {
  showPage("page-income", "nav-income");
  loadIncomePage();
});

document.getElementById("nav-simulator").addEventListener("click", () => {
  showPage("page-simulator", "nav-simulator");
});

// ===================== LOGOUT =====================

document.getElementById("btn-logout").addEventListener("click", async () => {
  closeMenu();
  const res = await fetch(API + "/user/" + userId);
  const user = await res.json();
  document.getElementById("logout-passphrase").textContent = user.passphrase;
  document.getElementById("logout-overlay").classList.remove("hidden");
});

document.getElementById("logout-confirm").addEventListener("click", () => {
  localStorage.removeItem("userId");
  window.location.href = "first-setup.html";
});

document.getElementById("logout-cancel").addEventListener("click", () => {
  document.getElementById("logout-overlay").classList.add("hidden");
});

// ===================== SETTINGS MODAL =====================

const settingsModal = document.getElementById("settings-modal");

document.getElementById("btn-settings").addEventListener("click", async () => {
  closeMenu();
  const res = await fetch(API + "/user/" + userId);
  const user = await res.json();

  document.getElementById("s-name").value = user.name;
  document.getElementById("s-goal").value = user.goal;
  document.getElementById("s-goal-sum").value = user.goal_sum;
  document.getElementById("s-deadline").value = user.deadline;
  document.getElementById("s-parents").value = user.parents_daily;
  document.getElementById("s-other-income").value = user.other_income || "";
  document.getElementById("s-other-amount").value = user.other_amount || "";
  document.getElementById("s-must-spend").value = user.must_spend || "";
  document.getElementById("s-passphrase").value = user.passphrase || "";

  settingsModal.classList.remove("hidden");
});

document.getElementById("btn-modal-cancel").addEventListener("click", () => {
  settingsModal.classList.add("hidden");
});

document.getElementById("btn-save").addEventListener("click", async () => {
  const body = {
    name: document.getElementById("s-name").value.trim(),
    goal: document.getElementById("s-goal").value.trim(),
    goal_sum: parseFloat(document.getElementById("s-goal-sum").value),
    deadline: parseInt(document.getElementById("s-deadline").value),
    parents_daily: parseFloat(document.getElementById("s-parents").value),
    other_income:
      document.getElementById("s-other-income").value.trim() || null,
    other_amount:
      parseFloat(document.getElementById("s-other-amount").value) || null,
    must_spend:
      parseFloat(document.getElementById("s-must-spend").value) || null,
  };

  const res = await fetch(API + "/user/" + userId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const user = await res.json();
    renderUser(user);
    settingsModal.classList.add("hidden");
  } else {
    await showAlert("Помилка збереження");
  }
});

document
  .getElementById("btn-edit-passphrase")
  .addEventListener("click", async () => {
    const input = document.getElementById("s-passphrase");
    if (input.readOnly) {
      input.readOnly = false;
      input.style.color = "#333";
      input.style.fontStyle = "normal";
      input.focus();
      document.getElementById("btn-edit-passphrase").textContent = "Зберегти";
    } else {
      const newPhrase = input.value.trim();
      if (!newPhrase) return;
      const res = await fetch(API + "/user/" + userId + "/passphrase", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: newPhrase }),
      });
      if (res.ok) {
        input.readOnly = true;
        input.style.color = "#aaa";
        input.style.fontStyle = "italic";
        document.getElementById("btn-edit-passphrase").textContent = "Змінити";
        await showAlert("Фразу оновлено!");
      } else {
        const err = await res.json();
        await showAlert(err.error || "Помилка");
      }
    }
  });

document.getElementById("btn-delete").addEventListener("click", async () => {
  const confirm = await showPrompt(
    "Введи своє ім'я щоб підтвердити видалення:",
  );
  const res = await fetch(API + "/user/" + userId);
  const user = await res.json();

  if (confirm !== user.name) {
    await showAlert("Ім'я не співпадає, акаунт не видалено");
    return;
  }

  await fetch(API + "/user/" + userId, { method: "DELETE" });
  localStorage.removeItem("userId");
  window.location.href = "first-setup.html";
});

// ===================== AVATAR UPLOAD =====================

document.getElementById("avatar-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 100 * 1024 * 1024) {
    await showAlert("Файл більше 100 МБ");
    return;
  }

  const formData = new FormData();
  formData.append("avatar", file);

  const res = await fetch(API + "/user/" + userId + "/avatar", {
    method: "POST",
    body: formData,
  });

  if (res.ok) {
    const data = await res.json();
    document.getElementById("profile-avatar").src = data.avatar;
    document.getElementById("avatar-preview").src = data.avatar;
  } else {
    await showAlert("Помилка завантаження фото");
  }
});

// ===================== EXPENSES =====================

const expenseModal = document.getElementById("expense-modal");

document.getElementById("btn-add-expense").addEventListener("click", () => {
  document.getElementById("e-title").value = "";
  document.getElementById("e-amount").value = "";
  expenseModal.classList.remove("hidden");
});

document.getElementById("btn-expense-cancel").addEventListener("click", () => {
  expenseModal.classList.add("hidden");
});

document
  .getElementById("btn-expense-save")
  .addEventListener("click", async () => {
    const title = document.getElementById("e-title").value.trim();
    const category = document.getElementById("e-category").value;
    const amount = parseFloat(document.getElementById("e-amount").value);
    const repeat_type = document.getElementById("e-repeat").value;

    if (!title || !amount) {
      await showAlert("Заповніть назву і суму");
      return;
    }

    const res = await fetch(API + "/user/" + userId + "/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, amount, repeat_type }),
    });

    if (res.ok) {
      expenseModal.classList.add("hidden");
      loadExpenses();
    } else {
      await showAlert("Помилка збереження");
    }
  });

const CATEGORY_ICONS = {
  їжа: "🍔",
  транспорт: "🚌",
  розваги: "🎮",
  одяг: "👕",
  навчання: "📚",
  "здоров'я": "💊",
  інше: "📦",
};

async function loadExpenses() {
  const res = await fetch(API + "/user/" + userId + "/expenses");
  const list = await res.json();

  // Регулярні — всі не одноразові
  const recurring = list.filter((e) => e.repeat_type !== "одноразово");
  // Історія — тільки одноразові витрати
  const history = list.filter((e) => e.repeat_type === "одноразово");

  const recurringEl = document.getElementById("recurring-list");
  const historyEl = document.getElementById("history-list");

  if (!recurring.length) {
    recurringEl.innerHTML = `<p style="color:#999;font-size:0.9rem">Регулярних витрат немає</p>`;
  } else {
    recurringEl.innerHTML = recurring
      .map(
        (e) => `
            <div class="expense-item ${e.active ? "" : "expense-item--inactive"}">
                <div class="expense-item__left">
                    <span class="expense-item__title">${CATEGORY_ICONS[e.category] || "📦"} ${e.title}</span>
                    <span class="expense-item__meta">${e.category} · ${e.repeat_type}</span>
                </div>
                <span class="expense-item__amount">-${e.amount} грн</span>
                ${e.active
            ? `<button class="expense-item__stop" onclick="stopExpense(${e.id})">Зупинити</button>`
            : `<span style="font-size:0.75rem;color:#bbb;margin-left:12px">зупинено</span>`
          }
            </div>
        `,
      )
      .join("");
  }

  if (!history.length) {
    historyEl.innerHTML = `<p style="color:#999;font-size:0.9rem">Витрат ще немає</p>`;
  } else {
    historyEl.innerHTML = history
      .map(
        (e) => `
            <div class="expense-item">
                <div class="expense-item__left">
                    <span class="expense-item__title">${CATEGORY_ICONS[e.category] || "📦"} ${e.title}</span>
                    <span class="expense-item__meta">${e.category} · ${e.created_at}</span>
                </div>
                <span class="expense-item__amount">-${e.amount} грн</span>
            </div>
        `,
      )
      .join("");
  }
}

async function stopExpense(id) {
  await fetch(API + "/user/" + userId + "/expenses/" + id, { method: "PATCH" });
  loadExpenses();
}

// ===================== ДОХОДИ =====================

const incomeModal = document.getElementById("income-modal");

document.getElementById("btn-add-income").addEventListener("click", () => {
  document.getElementById("i-title").value = "";
  document.getElementById("i-amount").value = "";
  incomeModal.classList.remove("hidden");
});

document.getElementById("btn-income-cancel").addEventListener("click", () => {
  incomeModal.classList.add("hidden");
});

document
  .getElementById("btn-income-save")
  .addEventListener("click", async () => {
    const title = document.getElementById("i-title").value.trim();
    const amount = parseFloat(document.getElementById("i-amount").value);

    if (!title || !amount) {
      await showAlert("Заповніть опис і суму");
      return;
    }

    const res = await fetch(API + "/user/" + userId + "/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, amount }),
    });

    if (res.ok) {
      incomeModal.classList.add("hidden");
      loadIncomePage();
      // оновлюємо баланс
      const balRes = await fetch(API + "/user/" + userId + "/balance");
      const bal = await balRes.json();
      const userRes = await fetch(API + "/user/" + userId);
      const user = await userRes.json();
      renderProgress(bal.balance, user.goal_sum);
    } else {
      await showAlert("Помилка збереження");
    }
  });

async function loadIncomePage() {
  const [userRes, incomesRes] = await Promise.all([
    fetch(API + "/user/" + userId),
    fetch(API + "/user/" + userId + "/income"),
  ]);

  const user = await userRes.json();
  const incomes = await incomesRes.json();

  const dailyIncome =
    (user.parents_daily || 0) +
    (user.other_amount || 0) -
    (user.must_spend || 0);

  const cardsEl = document.getElementById("income-info-cards");
  cardsEl.innerHTML = `
        <div class="card">
            <p class="card__label">Від батьків</p>
            <p class="card__value">${user.parents_daily || 0} грн/день</p>
        </div>
        ${user.other_income
      ? `
        <div class="card">
            <p class="card__label">Інший дохід (${user.other_income})</p>
            <p class="card__value">${user.other_amount || 0} грн/день</p>
        </div>`
      : ""
    }
        <div class="card">
            <p class="card__label">Обов'язкові витрати</p>
            <p class="card__value">${user.must_spend || 0} грн/день</p>
        </div>
        <div class="card">
            <p class="card__label">Денний дохід</p>
            <p class="card__value">${dailyIncome.toFixed(2)} грн/день</p>
        </div>
    `;

  const listEl = document.getElementById("one-time-income-list");
  if (!incomes.length) {
    listEl.innerHTML = `<p style="color:#999;font-size:0.9rem">Одноразових доходів ще немає</p>`;
  } else {
    listEl.innerHTML = incomes
      .map(
        (i) => `
            <div class="expense-item">
                <div class="expense-item__left">
                    <span class="expense-item__title">💰 ${i.title}</span>
                    <span class="expense-item__meta">${i.date}</span>
                </div>
                <span class="expense-item__amount" style="color:#43D000">+${i.amount} грн</span>
            </div>
        `,
      )
      .join("");
  }
}

// ===================== SIMULATION MODE CONTROLLER =====================

let clickCount = 0;
document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("modal__title")) {
    clickCount++;
    if (clickCount >= 7) {
      clickCount = 0;
      const userRes = await fetch(API + "/user/" + userId);
      const user = await userRes.json();
      if (user.simulation_date) {
        await showAlert("Режим симуляції вже активовано!");
        return;
      }

      const confirm = await showConfirm(
        "Увага! Ви дійсно хочете увімкнути режим симуляції? Цю дію неможливо скасувати, і симуляція залишиться назавжди."
      );
      if (confirm) {
        const res = await fetch(API + "/user/" + userId + "/simulation/enable", {
          method: "POST"
        });
        if (res.ok) {
          await showAlert("Режим симуляції активовано!");
          location.reload();
        } else {
          await showAlert("Помилка при активації режиму симуляції");
        }
      }
    }
  }
});

// Event listeners for Simulator Page buttons
document.getElementById("btn-sim-random-income").addEventListener("click", async () => {
  const res = await fetch(API + "/user/" + userId + "/simulation/random-income", {
    method: "POST"
  });
  if (res.ok) {
    const data = await res.json();
    await showAlert(`Додано випадковий дохід:\n"${data.title}" на суму +${data.amount} грн!`);
    await loadUserData();
  } else {
    await showAlert("Не вдалося додати дохід");
  }
});

document.getElementById("btn-sim-random-expense").addEventListener("click", async () => {
  const res = await fetch(API + "/user/" + userId + "/simulation/random-expense", {
    method: "POST"
  });
  if (res.ok) {
    const data = await res.json();
    await showAlert(`Додано випадкову витрату:\n"${data.title}" (${data.category}) на суму -${data.amount} грн!`);
    await loadUserData();
  } else {
    await showAlert("Не вдалося додати витрату");
  }
});

document.getElementById("btn-sim-next-day").addEventListener("click", async () => {
  const res = await fetch(API + "/user/" + userId + "/simulation/next-day", {
    method: "POST"
  });
  if (res.ok) {
    const data = await res.json();
    await showAlert(`Настав наступний день! Нова дата: ${data.simulation_date}. Баланс перераховано.`);
    await loadUserData();
  } else {
    await showAlert("Не вдалося перейти на наступний день");
  }
});
