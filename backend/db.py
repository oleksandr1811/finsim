import sqlite3
import random

DB_PATH = "database.db"

ADJECTIVES = ["синій", "зелений", "швидкий", "тихий", "яскравий", "сміливий", "мудрий", "веселий", "сильний", "вільний"]
NOUNS      = ["дракон", "орел", "вовк", "тигр", "лис", "сокіл", "ведмідь", "леопард", "кит", "лев"]


def generate_passphrase():
    adj  = random.choice(ADJECTIVES)
    noun = random.choice(NOUNS)
    num  = random.randint(10, 99)
    return f"{adj}-{noun}-{num}"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT    NOT NULL,
            goal          TEXT    NOT NULL,
            goal_sum      REAL    NOT NULL,
            deadline      INTEGER NOT NULL,
            parents_daily REAL    NOT NULL,
            other_income  TEXT,
            other_amount  REAL,
            must_spend    REAL,
            avatar        TEXT,
            startDate     TEXT,
            passphrase    TEXT    UNIQUE,
            simulation_date TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS balance_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            amount     REAL    NOT NULL,
            date       TEXT    NOT NULL,
            note       TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            title       TEXT    NOT NULL,
            category    TEXT    NOT NULL,
            amount      REAL    NOT NULL,
            repeat_type TEXT    NOT NULL,
            created_at  TEXT    NOT NULL,
            active      INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS one_time_income (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            title      TEXT    NOT NULL,
            amount     REAL    NOT NULL,
            date       TEXT    NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    for col in ["avatar", "passphrase", "simulation_date"]:
        try:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT")
        except Exception:
            pass
    try:
        conn.execute("ALTER TABLE expenses ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE balance_log ADD COLUMN note TEXT")
    except Exception:
        pass
    conn.commit()
    conn.close()


def get_today_date(user_id):
    from datetime import date
    conn = get_connection()
    row = conn.execute("SELECT simulation_date FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if row and row["simulation_date"]:
        return row["simulation_date"]
    return str(date.today())


def update_simulation_date(user_id, new_date):
    conn = get_connection()
    conn.execute("UPDATE users SET simulation_date=? WHERE id=?", (new_date, user_id))
    conn.commit()
    conn.close()



def create_user(name, goal, goal_sum, deadline, parents_daily, other_income, other_amount, must_spend, start_date):
    conn = get_connection()
    # генеруємо унікальну фразу
    while True:
        phrase = generate_passphrase()
        exists = conn.execute("SELECT id FROM users WHERE passphrase=?", (phrase,)).fetchone()
        if not exists:
            break
    cursor = conn.execute(
        """
        INSERT INTO users (name, goal, goal_sum, deadline, parents_daily, other_income, other_amount, must_spend, startDate, passphrase)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (name, goal, goal_sum, deadline, parents_daily, other_income, other_amount, must_spend, start_date, phrase)
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return user_id, phrase


def get_user(user_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_passphrase(phrase):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE passphrase = ?", (phrase,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_user(user_id, name, goal, goal_sum, deadline, parents_daily, other_income, other_amount, must_spend, start_date=None):
    conn = get_connection()
    if start_date is None:
        row = conn.execute("SELECT startDate FROM users WHERE id=?", (user_id,)).fetchone()
        start_date = row["startDate"] if row else None
    conn.execute(
        """
        UPDATE users SET name=?, goal=?, goal_sum=?, deadline=?, parents_daily=?,
            other_income=?, other_amount=?, must_spend=?, startDate=?
        WHERE id=?
        """,
        (name, goal, goal_sum, deadline, parents_daily, other_income, other_amount, must_spend, start_date, user_id)
    )
    conn.commit()
    conn.close()


def update_passphrase(user_id, new_phrase):
    conn = get_connection()
    exists = conn.execute("SELECT id FROM users WHERE passphrase=? AND id!=?", (new_phrase, user_id)).fetchone()
    if exists:
        conn.close()
        return False
    conn.execute("UPDATE users SET passphrase=? WHERE id=?", (new_phrase, user_id))
    conn.commit()
    conn.close()
    return True


def update_avatar(user_id, avatar_b64):
    conn = get_connection()
    conn.execute("UPDATE users SET avatar=? WHERE id=?", (avatar_b64, user_id))
    conn.commit()
    conn.close()


def delete_user(user_id):
    conn = get_connection()
    conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    conn.commit()
    conn.close()

def getStartDate(user_id):
    conn = get_connection()
    row = conn.execute("SELECT startDate FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return row["startDate"] if row else None

def get_balance(user_id):
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) as total FROM balance_log WHERE user_id=?",
        (user_id,)
    ).fetchone()
    conn.close()
    return row["total"]


def add_balance_day(user_id, amount, date):
    conn = get_connection()
    exists = conn.execute(
        "SELECT id FROM balance_log WHERE user_id=? AND date=?", (user_id, date)
    ).fetchone()
    if not exists:
        conn.execute(
            "INSERT INTO balance_log (user_id, amount, date) VALUES (?, ?, ?)",
            (user_id, amount, date)
        )
        conn.commit()
    conn.close()
    return not exists


def get_last_balance_date(user_id):
    conn = get_connection()
    row = conn.execute(
        "SELECT MAX(date) as last_date FROM balance_log WHERE user_id=?", (user_id,)
    ).fetchone()
    conn.close()
    return row["last_date"]


def add_expense(user_id, title, category, amount, repeat_type, created_at):
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO expenses (user_id, title, category, amount, repeat_type, created_at, active) VALUES (?,?,?,?,?,?,1)",
        (user_id, title, category, amount, repeat_type, created_at)
    )
    conn.commit()
    exp_id = cursor.lastrowid
    # одноразова витрата — одразу знімаємо з балансу (якщо вистачає)
    if repeat_type == "одноразово":
        current = get_balance(user_id)
        deduct  = min(amount, max(current, 0))
        if deduct > 0:
            conn.execute(
                "INSERT INTO balance_log (user_id, amount, date) VALUES (?, ?, ?)",
                (user_id, -deduct, created_at)
            )
            conn.commit()
    conn.close()
    return exp_id


def deactivate_expense(expense_id, user_id):
    conn = get_connection()
    conn.execute("UPDATE expenses SET active=0 WHERE id=? AND user_id=?", (expense_id, user_id))
    conn.commit()
    conn.close()


def get_expenses(user_id):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM expenses WHERE user_id=? ORDER BY created_at DESC", (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def apply_recurring_expense(user_id, expense, today):
    from datetime import date

    repeat     = expense["repeat_type"]
    amount     = expense["amount"]
    key        = f"expense-{expense['id']}"
    created_at = expense["created_at"]

    conn = get_connection()

    last_row = conn.execute(
        "SELECT MAX(date) as last FROM balance_log WHERE user_id=? AND note=?",
        (user_id, key)
    ).fetchone()
    last = last_row["last"]

    today_d   = date.fromisoformat(today)
    created_d = date.fromisoformat(created_at)
    should_apply = False

    if last is None:
        # перший раз — застосовуємо тільки з наступного дня після створення
        if today_d > created_d:
            should_apply = True
    else:
        last_d = date.fromisoformat(last)
        if   repeat == "щодня"    and last_d < today_d:
            should_apply = True
        elif repeat == "щотижня"  and (today_d - last_d).days >= 7:
            should_apply = True
        elif repeat == "щомісяця" and (today_d.year * 12 + today_d.month) > (last_d.year * 12 + last_d.month):
            should_apply = True
        elif repeat == "щороку"   and today_d.year > last_d.year:
            should_apply = True

    if should_apply:
        # не йдемо в мінус
        current = get_balance(user_id)
        deduct  = min(amount, max(current, 0))
        if deduct > 0:
            conn.execute(
                "INSERT INTO balance_log (user_id, amount, date, note) VALUES (?,?,?,?)",
                (user_id, -deduct, today, key)
            )
            conn.commit()

    conn.close()


def add_one_time_income(user_id, title, amount, date):
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO one_time_income (user_id, title, amount, date) VALUES (?,?,?,?)",
        (user_id, title, amount, date)
    )
    inc_id = cursor.lastrowid
    conn.execute(
        "INSERT INTO balance_log (user_id, amount, date, note) VALUES (?,?,?,?)",
        (user_id, amount, date, f"income-{inc_id}")
    )
    conn.commit()
    conn.close()
    return inc_id


def get_one_time_incomes(user_id):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM one_time_income WHERE user_id=? ORDER BY date DESC",
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_today_stats(user_id, today):
    conn = get_connection()
    # витрати сьогодні: одноразові витрати + регулярні
    one_time_exp = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND created_at=? AND repeat_type='одноразово'",
        (user_id, today)
    ).fetchone()["total"]

    recurring_exp = conn.execute(
        "SELECT COALESCE(SUM(ABS(amount)),0) as total FROM balance_log WHERE user_id=? AND date=? AND note LIKE 'expense-%'",
        (user_id, today)
    ).fetchone()["total"]

    # одноразові доходи сьогодні
    one_time_inc = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as total FROM one_time_income WHERE user_id=? AND date=?",
        (user_id, today)
    ).fetchone()["total"]

    conn.close()
    return {
        "today_expenses": one_time_exp + recurring_exp,
        "today_one_time_income": one_time_inc
    }


def get_balance_history(user_id, days=30):
    """Повертає баланс за кожен день останніх N днів"""
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT date, SUM(amount) as day_change
        FROM balance_log
        WHERE user_id=?
        GROUP BY date
        ORDER BY date ASC
        """,
        (user_id,)
    ).fetchall()
    conn.close()
    return [{"date": r["date"], "day_change": r["day_change"]} for r in rows]

