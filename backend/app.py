from flask import Flask, request, jsonify
from flask_cors import CORS
import db
import base64
from datetime import date as dt_date, datetime

app = Flask(__name__)
CORS(app)

db.init()

MAX_AVATAR_BYTES = 100 * 1024 * 1024


@app.route("/api/user", methods=["POST"])
def create_user():
    data          = request.get_json()
    name          = data.get("name")
    goal          = data.get("goal")
    goal_sum      = data.get("goal_sum")
    deadline      = data.get("deadline")
    parents_daily = data.get("parents_daily")
    other_income  = data.get("other_income")
    other_amount  = data.get("other_amount")
    must_spend    = data.get("must_spend")
    start_date    = datetime.now().strftime("%d.%m")

    if not all([name, goal, goal_sum, deadline, parents_daily]):
        return jsonify({"error": "Заповніть всі обов'язкові поля"}), 400

    user_id, phrase = db.create_user(name, goal, goal_sum, deadline, parents_daily, other_income, other_amount, must_spend, start_date)
    return jsonify({"id": user_id, "passphrase": phrase}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data   = request.get_json()
    phrase = (data.get("passphrase") or "").strip()
    user   = db.get_user_by_passphrase(phrase)
    if not user:
        return jsonify({"error": "Фразу не знайдено"}), 404
    return jsonify({"id": user["id"]})


@app.route("/api/user/<int:user_id>", methods=["GET"])
def get_user(user_id):
    user = db.get_user(user_id)
    if not user:
        return jsonify({"error": "Користувача не знайдено"}), 404
    return jsonify(user)


@app.route("/api/user/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404

    data          = request.get_json()
    name          = data.get("name")
    goal          = data.get("goal")
    goal_sum      = data.get("goal_sum")
    deadline      = data.get("deadline")
    parents_daily = data.get("parents_daily")
    other_income  = data.get("other_income")
    other_amount  = data.get("other_amount")
    must_spend    = data.get("must_spend")
    start_date    = data.get("startDate")

    if not all([name, goal, goal_sum, deadline, parents_daily]):
        return jsonify({"error": "Заповніть всі обов'язкові поля"}), 400

    db.update_user(user_id, name, goal, goal_sum, deadline, parents_daily, other_income, other_amount, must_spend, start_date)
    return jsonify(db.get_user(user_id))


@app.route("/api/user/<int:user_id>/passphrase", methods=["PUT"])
def update_passphrase(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404

    phrase = (request.get_json().get("passphrase") or "").strip()
    if not phrase:
        return jsonify({"error": "Фраза не може бути порожньою"}), 400

    ok = db.update_passphrase(user_id, phrase)
    if not ok:
        return jsonify({"error": "Ця фраза вже зайнята"}), 409
    return jsonify({"passphrase": phrase})


@app.route("/api/user/<int:user_id>/avatar", methods=["POST"])
def upload_avatar(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404

    if "avatar" not in request.files:
        return jsonify({"error": "Файл не знайдено"}), 400

    file = request.files["avatar"]
    data = file.read()

    if len(data) > MAX_AVATAR_BYTES:
        return jsonify({"error": "Файл більше 100 МБ"}), 400

    mime = file.mimetype or "image/png"
    b64  = "data:" + mime + ";base64," + base64.b64encode(data).decode()
    db.update_avatar(user_id, b64)
    return jsonify({"avatar": b64})


@app.route("/api/user/<int:user_id>", methods=["DELETE"])
def delete_user(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404
    db.delete_user(user_id)
    return jsonify({"ok": True})

@app.route("/api/user/<int:user_id>/startDate", methods=["GET"])
def start_date(user_id):
    if not db.getStartDate(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404
    start_date = db.getStartDate(user_id)
    return jsonify({"startDate": start_date})

# ===================== BALANCE =====================

@app.route("/api/user/<int:user_id>/balance", methods=["GET"])
def get_balance(user_id):
    user = db.get_user(user_id)
    if not user:
        return jsonify({"error": "Користувача не знайдено"}), 404

    today = db.get_today_date(user_id)
    free_per_day = (user["parents_daily"] or 0) + (user["other_amount"] or 0) - (user["must_spend"] or 0)

    # додаємо вільні гроші за сьогодні
    db.add_balance_day(user_id, free_per_day, today)

    # списуємо повторювані витрати якщо настав час (тільки активні)
    expenses = db.get_expenses(user_id)
    for e in expenses:
        if e["repeat_type"] == "одноразово" or not e.get("active", 1):
            continue
        db.apply_recurring_expense(user_id, e, today)

    total = db.get_balance(user_id)
    return jsonify({"balance": total, "free_per_day": free_per_day})


# ===================== EXPENSES =====================

@app.route("/api/user/<int:user_id>/expenses", methods=["GET"])
def get_expenses(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404
    return jsonify(db.get_expenses(user_id))


@app.route("/api/user/<int:user_id>/expenses", methods=["POST"])
def add_expense(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404

    data        = request.get_json()
    title       = data.get("title", "").strip()
    category    = data.get("category", "інше")
    amount      = data.get("amount", 0)
    repeat_type = data.get("repeat_type", "одноразово")

    if not title or not amount:
        return jsonify({"error": "Заповніть всі поля"}), 400

    exp_id = db.add_expense(user_id, title, category, amount, repeat_type, db.get_today_date(user_id))
    return jsonify({"id": exp_id}), 201


@app.route("/api/user/<int:user_id>/expenses/<int:expense_id>", methods=["PATCH"])
def deactivate_expense(user_id, expense_id):
    db.deactivate_expense(expense_id, user_id)
    return jsonify({"ok": True})


# ===================== ONE-TIME INCOME =====================

@app.route("/api/user/<int:user_id>/income", methods=["GET"])
def get_incomes(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404
    return jsonify(db.get_one_time_incomes(user_id))


@app.route("/api/user/<int:user_id>/income", methods=["POST"])
def add_income(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404
    data   = request.get_json()
    title  = data.get("title", "").strip()
    amount = data.get("amount", 0)
    if not title or not amount:
        return jsonify({"error": "Заповніть всі поля"}), 400
    inc_id = db.add_one_time_income(user_id, title, float(amount), db.get_today_date(user_id))
    return jsonify({"id": inc_id}), 201


# ===================== STATS =====================

@app.route("/api/user/<int:user_id>/stats/today", methods=["GET"])
def get_today_stats(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404
    today = db.get_today_date(user_id)
    return jsonify(db.get_today_stats(user_id, today))


@app.route("/api/user/<int:user_id>/stats/history", methods=["GET"])
def get_balance_history(user_id):
    if not db.get_user(user_id):
        return jsonify({"error": "Користувача не знайдено"}), 404
    return jsonify(db.get_balance_history(user_id))


# ===================== SIMULATION =====================

@app.route("/api/user/<int:user_id>/simulation/enable", methods=["POST"])
def enable_simulation(user_id):
    user = db.get_user(user_id)
    if not user:
        return jsonify({"error": "Користувача не знайдено"}), 404
    if user.get("simulation_date"):
        return jsonify({"message": "Симуляція вже активована", "simulation_date": user["simulation_date"]})
    today = str(dt_date.today())
    db.update_simulation_date(user_id, today)
    return jsonify({"message": "Симуляцію активовано", "simulation_date": today})


@app.route("/api/user/<int:user_id>/simulation/next-day", methods=["POST"])
def simulation_next_day(user_id):
    user = db.get_user(user_id)
    if not user:
        return jsonify({"error": "Користувача не знайдено"}), 404
    sim_date_str = user.get("simulation_date")
    if not sim_date_str:
        return jsonify({"error": "Симуляція не активована"}), 400
    
    from datetime import date as py_date, timedelta
    curr_date = py_date.fromisoformat(sim_date_str)
    next_date = curr_date + timedelta(days=1)
    next_date_str = str(next_date)
    
    db.update_simulation_date(user_id, next_date_str)
    
    free_per_day = (user["parents_daily"] or 0) + (user["other_amount"] or 0) - (user["must_spend"] or 0)
    db.add_balance_day(user_id, free_per_day, next_date_str)
    
    expenses = db.get_expenses(user_id)
    for e in expenses:
        if e["repeat_type"] == "одноразово" or not e.get("active", 1):
            continue
        db.apply_recurring_expense(user_id, e, next_date_str)
        
    total = db.get_balance(user_id)
    return jsonify({
        "simulation_date": next_date_str,
        "balance": total,
        "message": "День успішно змінено"
    })


@app.route("/api/user/<int:user_id>/simulation/random-income", methods=["POST"])
def simulation_random_income(user_id):
    import random
    user = db.get_user(user_id)
    if not user:
        return jsonify({"error": "Користувача не знайдено"}), 404
    if not user.get("simulation_date"):
        return jsonify({"error": "Симуляція не активована"}), 400
    
    reasons = [
        "Подарунок від бабусі",
        "Продаж старої гри",
        "Перемога в кібертурнірі",
        "Кешбек за покупки",
        "Підробіток (вигул собаки)",
        "Допомога з домашнім завданням",
        "Продаж непотрібних речей",
        "Подарунок на день народження",
        "Знайшов у куртці"
    ]
    reason = random.choice(reasons)
    amount = random.randint(5, 50) * 10
    
    today = db.get_today_date(user_id)
    inc_id = db.add_one_time_income(user_id, reason, float(amount), today)
    
    return jsonify({
        "id": inc_id,
        "title": reason,
        "amount": amount,
        "date": today,
        "balance": db.get_balance(user_id)
    })


@app.route("/api/user/<int:user_id>/simulation/random-expense", methods=["POST"])
def simulation_random_expense(user_id):
    import random
    user = db.get_user(user_id)
    if not user:
        return jsonify({"error": "Користувача не знайдено"}), 404
    if not user.get("simulation_date"):
        return jsonify({"error": "Симуляція не активована"}), 400
    
    options = [
        ("Піца з друзями", "їжа", 100, 300),
        ("Квиток в кіно", "розваги", 120, 220),
        ("Донат в улюблену гру", "хобі", 50, 450),
        ("Нова футболка", "одяг", 250, 600),
        ("Поїздка на таксі", "транспорт", 80, 250),
        ("Купівля стікерів", "інше", 20, 80),
        ("Чіпси та газировка", "їжа", 40, 120),
        ("Чохол для телефону", "інше", 100, 300),
        ("Підписка на музику", "розваги", 150, 150),
        ("Нові навушники", "хобі", 300, 800)
    ]
    title, category, min_val, max_val = random.choice(options)
    amount = random.randint(min_val // 10, max_val // 10) * 10
    
    today = db.get_today_date(user_id)
    exp_id = db.add_expense(user_id, title, category, float(amount), "одноразово", today)
    
    return jsonify({
        "id": exp_id,
        "title": title,
        "category": category,
        "amount": amount,
        "date": today,
        "balance": db.get_balance(user_id)
    })



if __name__ == "__main__":
    app.run(debug=True, port=5000)
