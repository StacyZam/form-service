const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация файлового хранилища JSON
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify({ forms: [], submissions: [] }, null, 2));
}

function readDB() {
    try {
        const raw = fs.readFileSync(dbFile, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        return { forms: [], submissions: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// Настройки Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Главная страница сервиса
app.get('/', (req, res) => {
    res.render('index');
});

// 1. АДМИНКА: Главная страница со списком форм и аналитикой
app.get('/admin', (req, res) => {
    const db = readDB();

    const formsWithStats = db.forms.map(form => {
        const submissionsCount = db.submissions.filter(s => s.form_id === form.id).length;
        const viewsCount = form.views_count || 0;
        const conversion = viewsCount > 0
            ? Math.round((submissionsCount / viewsCount) * 100)
            : 0;

        return {
            ...form,
            submissions_count: submissionsCount,
            views_count: viewsCount,
            conversion
        };
    }).reverse();

    res.render('admin', { forms: formsWithStats, host: req.get('host'), protocol: req.protocol });
});

// 2. АДМИНКА: Создание новой формы
app.post('/admin/forms', (req, res) => {
    const { title, description, labels, types, required } = req.body;
    const formId = crypto.randomBytes(4).toString('hex');

    const fields = [];
    if (labels) {
        const labelList = Array.isArray(labels) ? labels : [labels];
        const typeList = Array.isArray(types) ? types : [types];
        const requiredList = Array.isArray(required) ? required : [required];

        for (let i = 0; i < labelList.length; i++) {
            if (labelList[i] && labelList[i].trim()) {
                fields.push({
                    id: `field_${i + 1}`,
                    label: labelList[i].trim(),
                    type: typeList[i] || 'text',
                    required: requiredList[i] === 'true' || requiredList[i] === true
                });
            }
        }
    }

    const db = readDB();
    db.forms.push({
        id: formId,
        title,
        description: description || '',
        fields,
        views_count: 0,
        created_at: new Date().toISOString()
    });
    writeDB(db);

    res.redirect('/admin');
});

// 3. АДМИНКА: Просмотр ответов конкретной формы
app.get('/admin/forms/:id/responses', (req, res) => {
    const db = readDB();
    const form = db.forms.find(f => f.id === req.params.id);
    if (!form) return res.status(404).send('Форма не найдена');

    const submissions = db.submissions
        .filter(s => s.form_id === req.params.id)
        .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

    res.render('responses', { form, submissions });
});

// 4. ПУБЛИЧНАЯ СТРАНИЦА: Заполнение формы студентом
app.get('/form/:id', (req, res) => {
    const db = readDB();
    const form = db.forms.find(f => f.id === req.params.id);
    if (!form) return res.status(404).send('Форма не найдена');

    // Увеличиваем просмотр
    form.views_count = (form.views_count || 0) + 1;
    writeDB(db);

    res.render('form', { form });
});

// 5. ПУБЛИЧНАЯ СТРАНИЦА: Отправка ответов
app.post('/form/:id', (req, res) => {
    const db = readDB();
    const form = db.forms.find(f => f.id === req.params.id);
    if (!form) return res.status(404).send('Форма не найдена');

    db.submissions.push({
        id: crypto.randomUUID(),
        form_id: form.id,
        answers: req.body,
        submitted_at: new Date().toISOString()
    });
    writeDB(db);

    res.render('success', { title: form.title });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    console.log(`Админ-панель: http://localhost:${PORT}/admin`);
});