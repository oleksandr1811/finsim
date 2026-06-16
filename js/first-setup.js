if (localStorage.getItem("userId")) {
    window.location.href = "index.html";
}

const API = "http://localhost:5000/api";

const overlay   = document.getElementById("popup-overlay");
const msgEl     = document.getElementById("popup-message");
const inputEl   = document.getElementById("popup-input");
const btnOk     = document.getElementById("popup-btn-ok");
const btnCancel = document.getElementById("popup-btn-cancel");

function showAlert(message) {
    msgEl.textContent = message;
    inputEl.classList.add("hidden");
    btnCancel.classList.add("hidden");
    overlay.classList.remove("hidden");

    return new Promise((resolve) => {
        btnOk.onclick = () => { overlay.classList.add("hidden"); resolve(); };
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
        btnCancel.onclick = () => { overlay.classList.add("hidden"); resolve(null); };
    });
}

const registerForm = document.getElementById("register-form");
const loginForm    = document.getElementById("login-form");

document.getElementById("show-login").addEventListener("click", () => {
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
});

document.getElementById("show-register").addEventListener("click", () => {
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
});


const title        = document.querySelector(".title");
const nameInput    = document.querySelector(".name");
const goalInput    = document.querySelector(".goal");
const sumInput     = document.querySelector(".sum");
const deadlineInput = document.querySelector(".deadline");
const parentsInput = document.querySelector(".parents");
const otherInput   = document.querySelector(".other-income");

nameInput.addEventListener("input", () => {
    if (nameInput.value.length >= 1) {
        title.textContent = "Привіт, " + nameInput.value + ", давай познайомимося!";
    } else {
        title.textContent = "Привіт, давай познайомимося!";
    }
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    let otherAmount = null;
    let mustSpend   = null;

    if (otherInput.value.trim() !== "") {
        let answer = null;
        while (answer === null) {
            answer = await showPrompt("Який дохід вам приносить " + otherInput.value + " щодня?");
            if (answer === null) break;
        }
        otherAmount = answer ? parseFloat(answer) : null;
    }

    const parentsValue = parseFloat(parentsInput.value);

    if (!isNaN(parentsValue) && parentsValue > 0) {
        let needToSpend = null;
        while (needToSpend === null) {
            needToSpend = await showPrompt("Скільки батьки тебе заставляють тратити щодня?");
            if (needToSpend === null) break;
            if (parseFloat(needToSpend) > parentsValue) {
                await showAlert("Шота циферки не сходяться");
                needToSpend = null;
            }
        }
        if (needToSpend !== null) mustSpend = parseFloat(needToSpend);
    }

    if (mustSpend !== null && otherAmount !== null) {
        const res = await fetch(API + "/user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name:          nameInput.value,
                goal:          goalInput.value,
                goal_sum:      parseFloat(sumInput.value),
                deadline:      parseInt(deadlineInput.value),
                parents_daily: parentsValue,
                other_income:  otherInput.value || null,
                other_amount:  otherAmount,
                must_spend:    mustSpend
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem("userId", data.id);
            window.location.href = "index.html";
        } else {
            await showAlert("Помилка збереження, спробуй ще раз");
        }
    } else {
        await showAlert("Будь ласка, заповни всі поля та введи коректні дані");
        return;
    }


});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const phrase = document.querySelector(".passphrase-input").value.trim();
    const res = await fetch(API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: phrase })
    });

    if (res.ok) {
        const data = await res.json();
        localStorage.setItem("userId", data.id);
        window.location.href = "index.html";
    } else {
        await showAlert("Фразу не знайдено, перевір та спробуй ще раз");
    }
});
