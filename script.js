const startScreen = document.querySelector("#start-screen");
const surveyForm = document.querySelector("#survey-form");
const finalScreen = document.querySelector("#final-screen");
const startButton = document.querySelector("#start-button");
const backButton = document.querySelector("#back-button");
const nextButton = document.querySelector("#next-button");
const questionCounter = document.querySelector("#question-counter");
const progressBar = document.querySelector("#progress-bar");
const progressTrack = document.querySelector(".progress-track");
const questions = [...document.querySelectorAll(".question")];
const errorMessage = document.querySelector("#validation-error");
const otherCheckbox = document.querySelector("#other-checkbox");
const otherField = document.querySelector("#other-field");
const otherText = document.querySelector("#other-text");

const SUPABASE_API_URL = "https://hayklcspxecyfaujizms.supabase.co/rest/v1/survey_responses";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_i7A90e-o3WXsY78DZLUCVA_8-PcA1Hi";
const totalQuestions = questions.length;
let currentQuestion = 1;
let isSubmitting = false;

function showQuestion(number) {
  currentQuestion = number;

  questions.forEach((question) => {
    question.classList.toggle("hidden", Number(question.dataset.question) !== number);
  });

  questionCounter.textContent = `Вопрос ${number} из ${totalQuestions}`;
  progressBar.style.width = `${(number / totalQuestions) * 100}%`;
  progressTrack.setAttribute("aria-valuenow", String(number));
  backButton.classList.toggle("hidden", number === 1);
  nextButton.textContent = number === totalQuestions ? "Отправить ответы" : "Далее";
  hideError();
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
}

function hideError() {
  errorMessage.textContent = "";
  errorMessage.classList.add("hidden");
}

function validateCurrentQuestion() {
  if (currentQuestion === 1 && !surveyForm.elements.gender.value) {
    showError("Выберите один вариант ответа.");
    return false;
  }

  if (currentQuestion === 2 && !surveyForm.elements.age.value) {
    showError("Выберите один вариант ответа.");
    return false;
  }

  if (currentQuestion === 3 && !surveyForm.elements.stressFrequency.value) {
    showError("Выберите один вариант ответа.");
    return false;
  }

  if (currentQuestion === 4) {
    const selectedSources = surveyForm.querySelectorAll('input[name="stressSources"]:checked');

    if (selectedSources.length === 0) {
      showError("Выберите минимум один вариант ответа.");
      return false;
    }

    if (otherCheckbox.checked && !otherText.value.trim()) {
      showError("Укажите свой вариант.");
      otherText.focus();
      return false;
    }
  }

  if (currentQuestion === 5 && !surveyForm.elements.difficultSituations.value.trim()) {
    showError("Введите ответ.");
    return false;
  }

  if (currentQuestion === 6 && !surveyForm.elements.recovery.value.trim()) {
    showError("Введите ответ.");
    return false;
  }

  hideError();
  return true;
}

function collectAnswers() {
  const stressSources = [
    ...surveyForm.querySelectorAll('input[name="stressSources"]:checked'),
  ].map((input) => (
    input.value === "Другое"
      ? `Другое: ${otherText.value.trim()}`
      : input.value
  ));

  return {
    gender: surveyForm.elements.gender.value,
    age_group: surveyForm.elements.age.value,
    stress_frequency: surveyForm.elements.stressFrequency.value,
    stress_sources: stressSources,
    difficult_situations: surveyForm.elements.difficultSituations.value.trim(),
    recovery_methods: surveyForm.elements.recovery.value.trim(),
  };
}

async function submitAnswers() {
  if (isSubmitting) {
    return;
  }

  isSubmitting = true;
  nextButton.disabled = true;
  backButton.disabled = true;
  nextButton.textContent = "Отправка...";
  hideError();

  try {
    const response = await fetch(SUPABASE_API_URL, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(collectAnswers()),
    });

    if (!response.ok) {
      throw new Error(`Supabase request failed with status ${response.status}`);
    }

    surveyForm.classList.add("hidden");
    finalScreen.classList.remove("hidden");
  } catch (error) {
    console.error("Не удалось отправить ответы:", error);
    showError("Не удалось отправить ответы. Проверьте подключение к интернету и попробуйте еще раз.");
  } finally {
    isSubmitting = false;
    nextButton.disabled = false;
    backButton.disabled = false;
    nextButton.textContent = "Отправить ответы";
  }
}

startButton.addEventListener("click", () => {
  startScreen.classList.add("hidden");
  surveyForm.classList.remove("hidden");
  showQuestion(1);
});

nextButton.addEventListener("click", async () => {
  if (!validateCurrentQuestion()) {
    return;
  }

  if (currentQuestion < totalQuestions) {
    showQuestion(currentQuestion + 1);
    return;
  }

  await submitAnswers();
});

backButton.addEventListener("click", () => {
  if (currentQuestion > 1) {
    showQuestion(currentQuestion - 1);
  }
});

otherCheckbox.addEventListener("change", () => {
  otherField.classList.toggle("hidden", !otherCheckbox.checked);

  if (!otherCheckbox.checked) {
    otherText.value = "";
  } else {
    otherText.focus();
  }

  hideError();
});

surveyForm.addEventListener("input", hideError);
surveyForm.addEventListener("submit", (event) => event.preventDefault());
