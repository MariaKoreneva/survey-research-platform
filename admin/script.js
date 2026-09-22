const SUPABASE_AUTH_URL = "https://hayklcspxecyfaujizms.supabase.co/auth/v1";
const SUPABASE_RESPONSES_URL = "https://hayklcspxecyfaujizms.supabase.co/rest/v1/survey_responses";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_i7A90e-o3WXsY78DZLUCVA_8-PcA1Hi";
const SESSION_STORAGE_KEY = "survey-admin-session";

const sessionStatus = document.querySelector("#session-status");
const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout-button");
const exportButton = document.querySelector("#export-button");
const navButtons = [...document.querySelectorAll(".nav-button")];
const panels = [...document.querySelectorAll(".panel")];
const overviewContent = document.querySelector("#overview-content");
const analyticsContent = document.querySelector("#analytics-content");
const openAnswersContent = document.querySelector("#open-answers-content");
const respondentsContent = document.querySelector("#respondents-content");

const GENDER_OPTIONS = ["Женский", "Мужской"];
const AGE_OPTIONS = ["20–29 лет", "30–39 лет", "40–49 лет", "50–59 лет", "60 лет и старше"];
const FREQUENCY_OPTIONS = [
  "Практически никогда",
  "Редко",
  "Иногда",
  "Часто",
  "Практически ежедневно",
];
const SOURCE_OPTIONS = [
  "Работа или учеба",
  "Отношения с близкими",
  "Финансовые вопросы",
  "Состояние здоровья",
  "Нехватка времени",
  "Неопределенность будущего",
];
const STOP_WORDS = new Set([
  "и", "в", "во", "на", "с", "со", "к", "ко", "у", "о", "об", "обо", "от", "до",
  "за", "из", "изо", "для", "по", "при", "а", "но", "или", "либо", "что", "чтобы",
  "как", "когда", "если", "это", "этот", "эта", "эти", "того", "тому", "так", "же",
  "бы", "ли", "я", "мы", "вы", "он", "она", "оно", "они", "мне", "меня", "мной",
  "мой", "моя", "мои", "моё", "свой", "своя", "свои", "себя", "себе", "его", "ее",
  "её", "их", "не", "ни", "да", "нет", "быть", "есть", "был", "была", "были",
  "будет", "то", "те", "такой", "такая", "такие", "который", "которая", "которые",
  "очень", "просто", "уже", "ещё", "еще", "только", "тоже", "также", "все", "всё",
  "всегда", "иногда", "после", "перед", "через", "между", "без", "над", "под", "про",
]);
let responsesLoadId = 0;
let loadedResponses = null;

function showLogin() {
  sessionStatus.classList.add("hidden");
  dashboardView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginForm.elements.password.value = "";
  loginForm.elements.email.focus();
}

function showDashboard() {
  sessionStatus.classList.add("hidden");
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  hideLoginError();
  loadResponses();
}

function showLoginError(message) {
  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

function hideLoginError() {
  loginError.textContent = "";
  loginError.classList.add("hidden");
}

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveSession(authResponse) {
  const expiresAt = authResponse.expires_at
    ?? Math.floor(Date.now() / 1000) + authResponse.expires_in;

  const session = {
    access_token: authResponse.access_token,
    refresh_token: authResponse.refresh_token,
    expires_at: expiresAt,
  };

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function showDataState(message, isError = false) {
  [overviewContent, analyticsContent, openAnswersContent, respondentsContent].forEach((container) => {
    const state = createElement("p", `data-state${isError ? " data-error" : ""}`, message);
    container.replaceChildren(state);
  });
}

function formatPercent(count, total) {
  if (!total) {
    return "0%";
  }

  const percent = (count / total) * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

function addObservedOptions(preferredOptions, values) {
  const options = [...preferredOptions];
  const knownOptions = new Set(options);

  values.forEach((value) => {
    if (typeof value === "string" && value.trim() && !knownOptions.has(value.trim())) {
      const normalizedValue = value.trim();
      knownOptions.add(normalizedValue);
      options.push(normalizedValue);
    }
  });

  return options;
}

function normalizeStressSources(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value);
    if (Array.isArray(parsedValue)) {
      return parsedValue.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
    }
  } catch {
    // Supabase normally returns a JSON array; retain a non-empty legacy string as one answer.
  }

  return [value.trim()];
}

function formatExportDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value == null ? "" : String(value);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function getExportValue(value) {
  return value == null ? "" : value;
}

async function exportResponsesToExcel() {
  const session = getStoredSession();
  let accessIsValid = false;

  try {
    accessIsValid = Boolean(
      session?.access_token && await validateAccessToken(session.access_token),
    );
  } catch (error) {
    console.error("Не удалось проверить авторизацию перед выгрузкой:", error);
  }

  if (!accessIsValid) {
    window.alert("Не удалось выполнить выгрузку: войдите в административную панель заново.");
    return;
  }

  if (!Array.isArray(loadedResponses)) {
    window.alert("Ответы еще загружаются или не были загружены. Дождитесь загрузки данных и попробуйте снова.");
    return;
  }

  if (loadedResponses.length === 0) {
    window.alert("Ответов для выгрузки пока нет.");
    return;
  }

  if (typeof ExcelJS === "undefined") {
    window.alert("Не удалось создать Excel-файл. Проверьте подключение к интернету и попробуйте снова.");
    return;
  }

  exportButton.disabled = true;
  exportButton.textContent = "Создание файла...";

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Ответы");

    worksheet.columns = [
      { header: "№ респондента", key: "respondentNumber", width: 16 },
      { header: "Дата отправки", key: "createdAt", width: 23 },
      { header: "Пол", key: "gender", width: 16 },
      { header: "Возраст", key: "ageGroup", width: 20 },
      { header: "Частота стресса", key: "stressFrequency", width: 24 },
      { header: "Источники стресса", key: "stressSources", width: 38 },
      {
        header: "В каких ситуациях вам особенно трудно справляться со стрессом?",
        key: "difficultSituations",
        width: 48,
      },
      {
        header: "Что помогает вам восстанавливаться после стрессовой ситуации?",
        key: "recoveryMethods",
        width: 48,
      },
    ];

    loadedResponses.forEach((response, index) => {
      worksheet.addRow({
        respondentNumber: index + 1,
        createdAt: formatExportDate(response.created_at),
        gender: getExportValue(response.gender),
        ageGroup: getExportValue(response.age_group),
        stressFrequency: getExportValue(response.stress_frequency),
        stressSources: normalizeStressSources(response.stress_sources).join("; "),
        difficultSituations: getExportValue(response.difficult_situations),
        recoveryMethods: getExportValue(response.recovery_methods),
      });
    });

    const headerRow = worksheet.getRow(1);
    headerRow.height = 42;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF705E82" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: "top" };
      }
    });
    ["G", "H"].forEach((columnName) => {
      worksheet.getColumn(columnName).alignment = { vertical: "top", wrapText: true };
    });
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = "A1:H1";

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
      [buffer],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    );
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = "survey_responses.xlsx";
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } catch (error) {
    console.error("Не удалось создать Excel-файл:", error);
    window.alert("Не удалось создать Excel-файл. Попробуйте повторить выгрузку.");
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = "Выгрузить ответы в Excel";
  }
}

function countValues(values) {
  const counts = new Map();

  values.forEach((value) => {
    if (typeof value === "string" && value.trim()) {
      const normalizedValue = value.trim();
      counts.set(normalizedValue, (counts.get(normalizedValue) ?? 0) + 1);
    }
  });

  return counts;
}

function createDistribution(title, options, counts, total) {
  const section = createElement("section", "distribution-card");
  section.append(createElement("h3", "", title));
  const list = createElement("div", "distribution-list");

  options.forEach((option) => {
    const count = counts.get(option) ?? 0;
    const row = createElement("div", "distribution-row");
    const heading = createElement("div", "distribution-heading");
    heading.append(
      createElement("span", "distribution-label", option),
      createElement("span", "distribution-value", `${count} · ${formatPercent(count, total)}`),
    );
    const track = createElement("div", "distribution-track");
    const bar = createElement("span", "distribution-bar");
    bar.style.width = formatPercent(count, total);
    track.append(bar);
    row.append(heading, track);
    list.append(row);
  });

  section.append(list);
  return section;
}

function renderOverview(responses) {
  if (responses.length === 0) {
    overviewContent.replaceChildren(createElement("p", "empty-state", "Ответов пока нет."));
    return;
  }

  const sourceValues = responses.flatMap((response) => normalizeStressSources(response.stress_sources));
  const totalCard = createElement("div", "total-card");
  totalCard.append(
    createElement("span", "total-label", "Всего респондентов"),
    createElement("strong", "total-value", String(responses.length)),
  );

  const distributions = createElement("div", "overview-grid");
  distributions.append(
    createDistribution(
      "Распределение по полу",
      addObservedOptions(GENDER_OPTIONS, responses.map((response) => response.gender)),
      countValues(responses.map((response) => response.gender)),
      responses.length,
    ),
    createDistribution(
      "Распределение по возрастным группам",
      addObservedOptions(AGE_OPTIONS, responses.map((response) => response.age_group)),
      countValues(responses.map((response) => response.age_group)),
      responses.length,
    ),
    createDistribution(
      "Частота состояния напряжения или стресса",
      addObservedOptions(FREQUENCY_OPTIONS, responses.map((response) => response.stress_frequency)),
      countValues(responses.map((response) => response.stress_frequency)),
      responses.length,
    ),
    createDistribution(
      "Источники стресса",
      addObservedOptions(SOURCE_OPTIONS, sourceValues),
      countValues(sourceValues),
      responses.length,
    ),
  );

  overviewContent.replaceChildren(totalCard, distributions);
}

function createAnalyticsFilter(label, name, options) {
  const field = createElement("label", "analytics-filter");
  field.append(createElement("span", "", label));

  const select = createElement("select");
  select.name = name;
  const allOption = createElement("option", "", "Все");
  allOption.value = "";
  select.append(allOption);

  options.forEach((option) => {
    const item = createElement("option", "", option);
    item.value = option;
    select.append(item);
  });

  field.append(select);
  return field;
}

function renderAnalytics(responses) {
  if (responses.length === 0) {
    analyticsContent.replaceChildren(
      createElement("p", "empty-state", "Недостаточно данных для анализа"),
    );
    return;
  }

  const observedSources = responses.flatMap((response) => normalizeStressSources(response.stress_sources));
  const filterOptions = {
    gender: addObservedOptions(GENDER_OPTIONS, responses.map((response) => response.gender)),
    ageGroup: addObservedOptions(AGE_OPTIONS, responses.map((response) => response.age_group)),
    frequency: addObservedOptions(FREQUENCY_OPTIONS, responses.map((response) => response.stress_frequency)),
    source: addObservedOptions(SOURCE_OPTIONS, observedSources),
  };

  const filters = createElement("form", "analytics-filters");
  filters.setAttribute("aria-label", "Фильтры аналитики");
  filters.append(
    createAnalyticsFilter("Пол", "gender", filterOptions.gender),
    createAnalyticsFilter("Возрастная группа", "ageGroup", filterOptions.ageGroup),
    createAnalyticsFilter("Частота стресса", "frequency", filterOptions.frequency),
    createAnalyticsFilter("Источник стресса", "source", filterOptions.source),
  );

  const resetButton = createElement("button", "button button-secondary analytics-reset", "Сбросить фильтры");
  resetButton.type = "reset";
  filters.append(resetButton);

  const results = createElement("div", "analytics-results");

  function updateAnalytics() {
    const selected = Object.fromEntries(new FormData(filters));
    const filteredResponses = responses.filter((response) => (
      (!selected.gender || response.gender === selected.gender)
      && (!selected.ageGroup || response.age_group === selected.ageGroup)
      && (!selected.frequency || response.stress_frequency === selected.frequency)
      && (
        !selected.source
        || normalizeStressSources(response.stress_sources).includes(selected.source)
      )
    ));

    const filteredTotal = filteredResponses.length;
    const summary = createElement("div", "analytics-summary");
    const totalCard = createElement("div", "metric-card");
    totalCard.append(
      createElement("span", "metric-label", "Всего респондентов"),
      createElement("strong", "metric-value", String(filteredTotal)),
      createElement(
        "span",
        "metric-detail",
        `${formatPercent(filteredTotal, responses.length)} от всех ответов`,
      ),
    );
    const matchedCard = createElement("div", "metric-card metric-card-secondary");
    matchedCard.append(
      createElement("span", "metric-label", "Подходят под фильтры"),
      createElement("strong", "metric-value", `${filteredTotal} из ${responses.length}`),
      createElement("span", "metric-detail", formatPercent(filteredTotal, responses.length)),
    );
    summary.append(totalCard, matchedCard);

    if (filteredTotal === 0) {
      results.replaceChildren(
        summary,
        createElement("p", "empty-state analytics-empty", "Недостаточно данных для анализа"),
      );
      return;
    }

    const sourceValues = filteredResponses.flatMap((response) => (
      [...new Set(normalizeStressSources(response.stress_sources))]
    ));
    const distributions = createElement("div", "analytics-grid");
    distributions.append(
      createDistribution(
        "Распределение по полу",
        filterOptions.gender,
        countValues(filteredResponses.map((response) => response.gender)),
        filteredTotal,
      ),
      createDistribution(
        "Распределение по возрастным группам",
        filterOptions.ageGroup,
        countValues(filteredResponses.map((response) => response.age_group)),
        filteredTotal,
      ),
      createDistribution(
        "Частота состояния напряжения или стресса",
        filterOptions.frequency,
        countValues(filteredResponses.map((response) => response.stress_frequency)),
        filteredTotal,
      ),
      createDistribution(
        "Источники стресса",
        filterOptions.source,
        countValues(sourceValues),
        filteredTotal,
      ),
    );

    results.replaceChildren(summary, distributions);
  }

  filters.addEventListener("change", updateAnalytics);
  filters.addEventListener("reset", () => {
    window.requestAnimationFrame(updateAnalytics);
  });

  analyticsContent.replaceChildren(filters, results);
  updateAnalytics();
}

function getWordFrequencies(answers) {
  const frequencies = new Map();
  let order = 0;

  answers.forEach((answer) => {
    const words = answer.toLocaleLowerCase("ru-RU").match(/[\p{L}\p{N}]+/gu) ?? [];

    words.forEach((word) => {
      if (STOP_WORDS.has(word)) {
        return;
      }

      if (!frequencies.has(word)) {
        frequencies.set(word, { word, count: 0, order });
        order += 1;
      }

      frequencies.get(word).count += 1;
    });
  });

  return [...frequencies.values()].sort((first, second) => (
    second.count - first.count || first.order - second.order
  ));
}

function createOpenAnswersCard(title, answers) {
  const card = createElement("article", "open-answer-card");
  card.append(createElement("h3", "", title));

  if (answers.length === 0) {
    card.append(createElement("p", "empty-state compact", "Ответов на этот вопрос пока нет."));
  } else {
    const answersList = createElement("div", "full-answers-list");
    answers.forEach(({ text, respondentNumber }) => {
      const item = createElement("div", "full-answer");
      item.append(
        createElement("strong", "respondent-caption", `Респондент №${respondentNumber}`),
        createElement("p", "", text),
      );
      answersList.append(item);
    });
    card.append(answersList);
  }

  return card;
}

function getTextAnswers(responses, fieldName) {
  return responses
    .map((response, index) => ({
      text: response[fieldName],
      respondentNumber: index + 1,
    }))
    .filter(({ text }) => typeof text === "string" && text.trim())
    .map(({ text, respondentNumber }) => ({ text: text.trim(), respondentNumber }));
}

function renderOpenAnswers(responses) {
  if (responses.length === 0) {
    openAnswersContent.replaceChildren(createElement("p", "empty-state", "Ответов пока нет."));
    return;
  }

  const cards = createElement("div", "open-answers-grid");
  cards.append(
    createOpenAnswersCard(
      "В каких ситуациях вам особенно трудно справляться со стрессом?",
      getTextAnswers(responses, "difficult_situations"),
    ),
    createOpenAnswersCard(
      "Что помогает вам восстанавливаться после стрессовой ситуации?",
      getTextAnswers(responses, "recovery_methods"),
    ),
  );
  openAnswersContent.replaceChildren(cards);
}

function displayValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "Нет ответа";
}

function createAnswerField(label, value) {
  const field = createElement("div", "answer-field");
  field.append(
    createElement("dt", "", label),
    createElement("dd", "", value),
  );
  return field;
}

function renderRespondentDetails(container, response, index) {
  const title = createElement("h3", "", `Респондент №${index + 1}`);
  const sources = normalizeStressSources(response.stress_sources);
  const answers = createElement("dl", "respondent-answers");
  answers.append(
    createAnswerField("Пол", displayValue(response.gender)),
    createAnswerField("Возраст", displayValue(response.age_group)),
    createAnswerField(
      "Частота состояния напряжения или стресса",
      displayValue(response.stress_frequency),
    ),
    createAnswerField("Источники стресса", sources.length ? sources.join("; ") : "Нет ответа"),
    createAnswerField(
      "В каких ситуациях особенно трудно справляться со стрессом",
      displayValue(response.difficult_situations),
    ),
    createAnswerField(
      "Что помогает восстанавливаться после стрессовой ситуации",
      displayValue(response.recovery_methods),
    ),
  );
  container.replaceChildren(title, answers);
}

function renderRespondents(responses) {
  if (responses.length === 0) {
    respondentsContent.replaceChildren(createElement("p", "empty-state", "Ответов пока нет."));
    return;
  }

  const layout = createElement("div", "respondents-layout");
  const list = createElement("div", "respondents-list");
  list.setAttribute("aria-label", "Список респондентов");
  const details = createElement("article", "respondent-details");

  responses.forEach((response, index) => {
    const button = createElement("button", `respondent-button${index === 0 ? " active" : ""}`, `Респондент №${index + 1}`);
    button.type = "button";
    button.setAttribute("aria-pressed", String(index === 0));
    button.addEventListener("click", () => {
      list.querySelectorAll(".respondent-button").forEach((listButton) => {
        const isSelected = listButton === button;
        listButton.classList.toggle("active", isSelected);
        listButton.setAttribute("aria-pressed", String(isSelected));
      });
      renderRespondentDetails(details, response, index);
    });
    list.append(button);
  });

  renderRespondentDetails(details, responses[0], 0);
  layout.append(list, details);
  respondentsContent.replaceChildren(layout);
}

async function loadResponses() {
  const currentLoadId = ++responsesLoadId;
  loadedResponses = null;
  showDataState("Загрузка данных...");
  const session = getStoredSession();

  if (!session?.access_token) {
    showDataState("Не удалось загрузить ответы: пользователь не авторизован.", true);
    return;
  }

  try {
    const fields = "id,created_at,gender,age_group,stress_frequency,stress_sources,difficult_situations,recovery_methods";
    const response = await fetch(`${SUPABASE_RESPONSES_URL}?select=${fields}&order=id.asc`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase request failed with status ${response.status}`);
    }

    const responses = await response.json();
    if (currentLoadId !== responsesLoadId) {
      return;
    }

    if (!Array.isArray(responses)) {
      throw new Error("Supabase returned an unexpected response");
    }

    loadedResponses = responses;
    renderOverview(responses);
    renderAnalytics(responses);
    renderOpenAnswers(responses);
    renderRespondents(responses);
  } catch (error) {
    if (currentLoadId !== responsesLoadId) {
      return;
    }

    console.error("Не удалось загрузить ответы:", error);
    showDataState("Не удалось загрузить ответы. Проверьте подключение и права доступа, затем обновите страницу.", true);
  }
}

async function authRequest(path, options = {}) {
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    ...options.headers,
  };

  return fetch(`${SUPABASE_AUTH_URL}${path}`, {
    ...options,
    headers,
  });
}

async function validateAccessToken(accessToken) {
  const response = await authRequest("/user", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.ok;
}

async function refreshSession(refreshToken) {
  const response = await authRequest("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    throw new Error("Session refresh failed");
  }

  return saveSession(await response.json());
}

async function restoreSession() {
  const storedSession = getStoredSession();

  if (!storedSession?.access_token || !storedSession?.refresh_token) {
    clearSession();
    showLogin();
    return;
  }

  try {
    const tokenIsCurrent = storedSession.expires_at > Math.floor(Date.now() / 1000) + 30;

    if (tokenIsCurrent && await validateAccessToken(storedSession.access_token)) {
      showDashboard();
      return;
    }

    await refreshSession(storedSession.refresh_token);
    showDashboard();
  } catch (error) {
    console.error("Не удалось восстановить сессию:", error);
    clearSession();
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = loginForm.elements.email.value.trim();
  const password = loginForm.elements.password.value;

  if (!email || !password) {
    showLoginError("Введите email и пароль.");
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "Вход...";
  hideLoginError();

  try {
    const response = await authRequest("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      showLoginError("Не удалось войти. Проверьте email и пароль.");
      return;
    }

    saveSession(await response.json());
    showDashboard();
  } catch (error) {
    console.error("Ошибка входа:", error);
    showLoginError("Не удалось подключиться к серверу. Попробуйте еще раз.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Войти";
  }
});

logoutButton.addEventListener("click", async () => {
  const session = getStoredSession();
  logoutButton.disabled = true;

  try {
    if (session?.access_token) {
      await authRequest("/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    }
  } catch (error) {
    console.error("Не удалось завершить сессию на сервере:", error);
  } finally {
    responsesLoadId += 1;
    loadedResponses = null;
    showDataState("Загрузка данных...");
    clearSession();
    logoutButton.disabled = false;
    showLogin();
  }
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    navButtons.forEach((navButton) => {
      const isActive = navButton === button;
      navButton.classList.toggle("active", isActive);

      if (isActive) {
        navButton.setAttribute("aria-current", "page");
      } else {
        navButton.removeAttribute("aria-current");
      }
    });

    panels.forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.panel !== button.dataset.section);
    });
  });
});

loginForm.addEventListener("input", hideLoginError);
exportButton.addEventListener("click", exportResponsesToExcel);
restoreSession();
