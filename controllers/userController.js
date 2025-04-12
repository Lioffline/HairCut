const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator'); // Добавьте этот импорт
const db = require("../dataBase/db.js");
const multer = require('multer');

exports.registerForm = (req, res) => {
    res.render('register', { 
        title: 'Регистрация',
        errors: req.session.errors,
        oldInput: req.session.oldInput,
        isAuthenticated: req.session.user !== undefined,
        user: req.session.user
    });
    req.session.errors = null;
    req.session.oldInput = null;
};

exports.register = async (req, res) => {
    const { email, password, confirmPassword, full_name, gender, phone } = req.body;
    
    req.session.oldInput = { email, full_name, gender, phone };
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.session.errors = errors.array();
        return res.redirect('/register');
    }
    
    if (password !== confirmPassword) {
        req.session.errors = [{ msg: 'Пароли не совпадают' }];
        return res.redirect('/register');
    }
    
    try {
        const [existingUser] = await db.promise().query(
            'SELECT id FROM users WHERE email = ?', 
            [email]
        );
        
        if (existingUser.length > 0) {
            req.session.errors = [{ msg: 'Пользователь с таким email уже существует' }];
            return res.redirect('/register');
        }
        
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        const [result] = await db.promise().query(
            'INSERT INTO users (email, password_hash, full_name, gender, phone, role_id) VALUES (?, ?, ?, ?, ?, ?)',
            [email, passwordHash, full_name, gender, phone, 1] // role_id = 1 клиент
        );
        
        const [newUser] = await db.promise().query(
            'SELECT id, email, full_name, role_id FROM users WHERE id = ?',
            [result.insertId]
        );
        
        req.session.user = {
            id: newUser[0].id,
            email: newUser[0].email,
            full_name: newUser[0].full_name,
            login: newUser[0].email.split('@')[0],
            role_id: newUser[0].role_id,
            phone: newUser[0].phone,
            avatar_path: newUser[0].avatar_path,
            gender: newUser[0].gender
        };
        res.redirect('/');
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        req.session.errors = [{ msg: 'Ошибка сервера при регистрации' }];
        res.redirect('/register');
    }
};

exports.loginForm = (req, res) => {
    res.render('login', {
        title: 'Вход',
        errors: req.session.errors,
        oldInput: req.session.oldInput,
        registered: req.query.registered,
        isAuthenticated: req.session.user !== undefined,
        user: req.session.user
    });
    req.session.errors = null;
    req.session.oldInput = null;
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    
    req.session.oldInput = { email };
    
    try {
        const [users] = await db.promise().query(
            'SELECT id, email, full_name, password_hash, role_id, avatar_path, phone, gender FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            req.session.errors = [{ msg: 'Неверный email или пароль' }];
            return res.redirect('/login');
        }
        
        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!isMatch) {
            req.session.errors = [{ msg: 'Неверный email или пароль' }];
            return res.redirect('/login');
        }

        req.session.user = {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            login: user.email.split('@')[0],
            role_id: user.role_id,
            phone: user.phone,
            avatar_path: user.avatar_path,
            gender: user.gender
        };
        
        res.redirect('/');
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        req.session.errors = [{ msg: 'Ошибка сервера при входе' }];
        res.redirect('/login');
    }
};

exports.settingsPage = (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    res.render('settings', {
        title: 'Настройки профиля',
        user: req.session.user,
        isAuthenticated: true
    });
};


const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'files'),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});

const upload = multer({ storage });

exports.uploadAvatar = upload.single('avatar');

exports.updateProfile = async (req, res) => {
    const { full_name, gender, phone } = req.body;
    const avatar_path = req.file ? req.file.filename : req.session.user.avatar_path;

    try {
        await db.promise().query(
            'UPDATE users SET full_name = ?, gender = ?, phone = ?, avatar_path = ? WHERE id = ?',
            [full_name, gender, phone, avatar_path, req.session.user.id]
        );
        req.session.user.full_name = full_name;
        req.session.user.gender = gender;
        req.session.user.phone = phone;
        req.session.user.avatar_path = avatar_path;
        res.redirect('/settings');
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        res.redirect('/settings');
    }
};

exports.updateAccount = async (req, res) => {
    const { email, current_password, new_password } = req.body;

    try {
        const [rows] = await db.promise().query(
            'SELECT password_hash FROM users WHERE id = ?',
            [req.session.user.id]
        );
        const user = rows[0];
        const isMatch = await bcrypt.compare(current_password, user.password_hash);

        if (!isMatch) {
            req.session.errors = [{ msg: 'Неверный текущий пароль' }];
            return res.redirect('/settings');
        }

        const updates = [email];
        let query = 'UPDATE users SET email = ?';
        if (new_password) {
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(new_password, salt);
            query += ', password_hash = ?';
            updates.push(password_hash);
        }
        query += ' WHERE id = ?';
        updates.push(req.session.user.id);

        await db.promise().query(query, updates);
        req.session.user.email = email;
        res.redirect('/settings');
    } catch (error) {
        console.error('Ошибка обновления аккаунта:', error);
        res.redirect('/settings');
    }
};

exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Ошибка при выходе:', err);
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
};

exports.newAppointmentForm = async (req, res) => {
    try {
        if (req.session.user.role_id !== 1) {
            return res.redirect('/');
        }

        // Получаем филиалы, мастера и услуги
        const [branches] = await db.promise().query('SELECT * FROM branches');
        const [haircuts] = await db.promise().query('SELECT * FROM haircuts WHERE gender = ? OR gender = "Универсальная"', [req.session.user.gender]);
        
        res.render('newAppointment', {
            title: 'Новая запись',
            isAuthenticated: true,
            user: req.session.user,
            branches,
            haircuts,
            errors: req.session.errors,
            oldInput: req.session.oldInput
        });

        req.session.errors = null;
        req.session.oldInput = null;
    } catch (error) {
        console.error('Ошибка при загрузке формы записи:', error);
        res.redirect('/');
    }
};

exports.createAppointment = async (req, res) => {
    const { branch_id, master_id, haircut_id, appointment_time } = req.body;
    
    try {
        if (req.session.user.role_id !== 1) {
            return res.redirect('/');
        }

        // Проверяем, что мастер работает в выбранном филиале
        const [master] = await db.promise().query(
            'SELECT id FROM users WHERE id = ? AND branch_id = ? AND role_id = 2',
            [master_id, branch_id]
        );

        if (master.length === 0) {
            req.session.errors = [{ msg: 'Выбранный мастер не работает в этом филиале' }];
            req.session.oldInput = req.body;
            return res.redirect('/appointments/new');
        }

        // Проверяем, что услуга доступна для пола клиента
        const [user] = await db.promise().query(
            'SELECT gender FROM users WHERE id = ?',
            [req.session.user.id]
        );

        const [haircut] = await db.promise().query(
            'SELECT id FROM haircuts WHERE id = ? AND (gender = ? OR gender = "Универсальная")',
            [haircut_id, user[0].gender]
        );

        if (haircut.length === 0) {
            req.session.errors = [{ msg: 'Выбранная услуга недоступна для вашего пола' }];
            req.session.oldInput = req.body;
            return res.redirect('/appointments/new');
        }

        // Создаем запись
        await db.promise().query(
            'INSERT INTO appointments (client_id, master_id, branch_id, haircut_id, appointment_time) VALUES (?, ?, ?, ?, ?)',
            [req.session.user.id, master_id, branch_id, haircut_id, appointment_time]
        );

        res.redirect('/');

    } catch (error) {
        console.error('Ошибка при создании записи:', error);
        req.session.errors = [{ msg: 'Ошибка при создании записи' }];
        req.session.oldInput = req.body;
        res.redirect('/appointments/new');
    }
};


// Новые методы

// Добавим новые методы

exports.editAppointmentForm = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        
        // Проверяем, что запись принадлежит клиенту
        const [appointment] = await db.promise().query(
            'SELECT * FROM appointments WHERE id = ? AND client_id = ? AND status = "запланирована"',
            [appointmentId, req.session.user.id]
        );
        
        if (appointment.length === 0) {
            return res.redirect('/');
        }

        const [branches] = await db.promise().query('SELECT * FROM branches');
        const [haircuts] = await db.promise().query('SELECT * FROM haircuts WHERE gender = ? OR gender = "Универсальная"', [req.session.user.gender]);
        const [masters] = await db.promise().query(
            'SELECT * FROM users WHERE branch_id = ? AND role_id = 2',
            [appointment[0].branch_id]
        );

        res.render('editAppointment', {
            title: 'Редактирование записи',
            isAuthenticated: true,
            user: req.session.user,
            appointment: appointment[0],
            branches,
            masters,
            haircuts,
            errors: req.session.errors,
            oldInput: req.session.oldInput
        });

        req.session.errors = null;
        req.session.oldInput = null;
    } catch (error) {
        console.error('Ошибка при загрузке формы редактирования:', error);
        res.redirect('/');
    }
};

exports.updateAppointment = async (req, res) => {
    const appointmentId = req.params.id;
    const { branch_id, master_id, haircut_id, appointment_time } = req.body;
    
    try {
        // Проверяем, что запись принадлежит клиенту и еще не выполнена/отменена
        const [existingAppointment] = await db.promise().query(
            'SELECT * FROM appointments WHERE id = ? AND client_id = ? AND status = "запланирована"',
            [appointmentId, req.session.user.id]
        );
        
        if (existingAppointment.length === 0) {
            return res.redirect('/');
        }

        // Проверяем, что мастер работает в выбранном филиале
        const [master] = await db.promise().query(
            'SELECT id FROM users WHERE id = ? AND branch_id = ? AND role_id = 2',
            [master_id, branch_id]
        );

        if (master.length === 0) {
            req.session.errors = [{ msg: 'Выбранный мастер не работает в этом филиале' }];
            req.session.oldInput = req.body;
            return res.redirect(`/appointments/${appointmentId}/edit`);
        }

        // Обновляем запись
        await db.promise().query(
            'UPDATE appointments SET branch_id = ?, master_id = ?, haircut_id = ?, appointment_time = ? WHERE id = ?',
            [branch_id, master_id, haircut_id, appointment_time, appointmentId]
        );

        res.redirect('/');

    } catch (error) {
        console.error('Ошибка при обновлении записи:', error);
        req.session.errors = [{ msg: 'Ошибка при обновлении записи' }];
        req.session.oldInput = req.body;
        res.redirect(`/appointments/${appointmentId}/edit`);
    }
};

exports.cancelAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        
        // Проверяем, что запись принадлежит клиенту и еще не выполнена/отменена
        const [result] = await db.promise().query(
            'UPDATE appointments SET status = "отменена" WHERE id = ? AND client_id = ? AND status = "запланирована"',
            [appointmentId, req.session.user.id]
        );
        
        if (result.affectedRows === 0) {
            req.session.errors = [{ msg: 'Не удалось отменить запись' }];
        }
        
        res.redirect('/');
    } catch (error) {
        console.error('Ошибка при отмене записи:', error);
        req.session.errors = [{ msg: 'Ошибка при отмене записи' }];
        res.redirect('/');
    }
};


exports.completeAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        
        // Проверяем, что запись принадлежит мастеру и еще не выполнена/отменена
        const [appointment] = await db.promise().query(
            'SELECT a.*, h.base_price FROM appointments a JOIN haircuts h ON a.haircut_id = h.id WHERE a.id = ? AND a.master_id = ? AND a.status = "запланирована"',
            [appointmentId, req.session.user.id]
        );
        
        if (appointment.length === 0) {
            return res.redirect('/');
        }

        // Получаем скидку клиента
        const [client] = await db.promise().query(
            'SELECT discount_id FROM users WHERE id = ?',
            [appointment[0].client_id]
        );
        
        let finalPrice = appointment[0].base_price;
        
        // Применяем скидку, если есть
        if (client[0].discount_id) {
            const [discount] = await db.promise().query(
                'SELECT discount_percent FROM discounts WHERE id = ?',
                [client[0].discount_id]
            );
            
            if (discount.length > 0) {
                finalPrice = finalPrice * (100 - discount[0].discount_percent) / 100;
            }
        }

        // Обновляем запись как выполненную
        await db.promise().query(
            'UPDATE appointments SET status = "выполнена", completed_date = CURDATE(), final_price = ? WHERE id = ?',
            [finalPrice, appointmentId]
        );

        // Увеличиваем счетчик заказов клиента
        await db.promise().query(
            'UPDATE users SET order_count = order_count + 1 WHERE id = ?',
            [appointment[0].client_id]
        );

        // Проверяем, нужно ли обновить скидку клиента
        const [clientOrders] = await db.promise().query(
            'SELECT order_count FROM users WHERE id = ?',
            [appointment[0].client_id]
        );
        
        const [discounts] = await db.promise().query('SELECT * FROM discounts ORDER BY min_orders DESC');
        
        for (const discount of discounts) {
            if (clientOrders[0].order_count >= discount.min_orders) {
                await db.promise().query(
                    'UPDATE users SET discount_id = ? WHERE id = ? AND (discount_id IS NULL OR discount_id != ?)',
                    [discount.id, appointment[0].client_id, discount.id]
                );
                break;
            }
        }

        res.redirect('/');
    } catch (error) {
        console.error('Ошибка при завершении записи:', error);
        res.redirect('/');
    }
};