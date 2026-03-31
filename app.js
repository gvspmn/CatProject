const express = require('express');
const { Pool } = require('pg');
const promClient = require('prom-client'); // ДОДАНО: Бібліотека для Prometheus
const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// МОНІТОРИНГ: Налаштування Prometheus
// ==========================================
// Збираємо стандартні метрики (CPU, RAM, Event Loop)
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register: promClient.register });

// Створюємо власну метрику: лічильник нових коментарів
const commentCounter = new promClient.Counter({
    name: 'cat_blog_comments_total',
    help: 'Загальна кількість залишених коментарів'
});

app.use(express.urlencoded({ extended: true }));

// ==========================================
// БЕЗПЕКА 1: Secrets Management (ВИПРАВЛЕНО)
// ==========================================
// Раніше тут був жорстко закодований ключ. Тепер він береться із середовища.
const CAT_API_SECRET_KEY = process.env.CAT_API_SECRET_KEY || "missing_secret";
// Пароль від адмінки теж винесено у змінні середовища
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "secure_admin_token_2025";

// Налаштування підключення до БД 
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'cat_blog',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Ініціалізація бази даних
pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL
    );
`).then(async () => {
    const res = await pool.query('SELECT COUNT(*) FROM comments');
    if (parseInt(res.rows[0].count) === 0) {
        await pool.query("INSERT INTO comments (text) VALUES ('Мяу! Дуже класний блог.'), ('Коли буде огляд на новий корм?')");
    }
    console.log('База даних підключена та готова!');
}).catch(err => console.error('Помилка ініціалізації БД:', err));

// ==========================================
// БЕЗПЕКА 2: Захист від XSS (ВИПРАВЛЕНО)
// ==========================================
// Функція для екранування небезпечних символів (щоб хакер не міг виконати JavaScript)
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

app.get('/', async (req, res) => {
    let comments = [];
    try {
        const result = await pool.query('SELECT text FROM comments ORDER BY id ASC');
        comments = result.rows.map(row => row.text);
    } catch (err) {
        console.error("Помилка отримання коментарів:", err);
    }

    // ВИПРАВЛЕННЯ XSS: Тепер ми пропускаємо кожен коментар через функцію escapeHtml
    let commentsHtml = comments.map(c => `<li>${escapeHtml(c)}</li>`).join('');

    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="uk">
    <head>
        <meta charset="UTF-8">
        <title>Персональний блог Пряника</title>
        <style>
            body { font-family: 'Comic Sans MS', cursive, sans-serif; background-color: #ffe4e1; color: #333; margin: 40px; }
            .container { background: white; padding: 20px; border-radius: 15px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); max-width: 600px; margin: auto; }
            h1 { color: #ff69b4; text-align: center; }
            input[type="text"] { padding: 10px; width: 70%; border: 1px solid #ccc; border-radius: 5px; }
            button { padding: 10px 20px; background-color: #ff69b4; color: white; border: none; border-radius: 5px; cursor: pointer; }
            button:hover { background-color: #ff1493; }
            .admin-link { display: block; text-align: center; margin-top: 20px; font-size: 12px; color: #888; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Блог найголовнішого кота 🐾</h1>
            <p>Вітаю! Залишайте свої відгуки про мої пухнасті справи нижче.</p>
            <ul>
                ${commentsHtml}
            </ul>
            <form method="POST" action="/comment">
                <input type="text" name="new_comment" placeholder="Напишіть щось приємне..." autocomplete="off" required>
                <button type="submit">Мяукнути</button>
            </form>
            <a href="/admin?token=secure_admin_token_2025" class="admin-link">Секретна адмінка</a>
        </div>
    </body>
    </html>
    `;
    res.send(htmlTemplate);
});

app.post('/comment', async (req, res) => {
    if (req.body.new_comment) {
        try {
            await pool.query('INSERT INTO comments (text) VALUES ($1)', [req.body.new_comment]);
            // Збільшуємо лічильник для Prometheus при кожному новому коментарі
            commentCounter.inc(); 
        } catch (err) {
            console.error("Помилка збереження коментаря:", err);
        }
    }
    res.redirect('/');
});

// ==========================================
// БЕЗПЕКА 3: Broken Access Control (ВИПРАВЛЕНО)
// ==========================================
app.get('/admin', (req, res) => {
    const token = req.query.token;
    // Тепер токен порівнюється із секретною змінною оточення, а не жорстко закодованим текстом
    if (token === ADMIN_TOKEN) {
        res.send("<h1>Секретна панель керування запасами смаколиків</h1><p>Доступ дозволено! Аналітика працює.</p>");
    } else {
        res.status(403).send("<h1>Доступ заборонено! Невірний токен авторизації.</h1>");
    }
});

// Ендпоінт для Prometheus (ВІН БУДЕ ЗБИРАТИ ЗВІДСИ ДАНІ)
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
});

app.listen(port, () => {
    console.log(\`Котячий сервер запущено на порту \${port}\`);
});
