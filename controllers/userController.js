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

exports.cancelAppointmentByMaster = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        
        // Проверяем, что запись принадлежит мастеру и еще не выполнена/отменена
        const [result] = await db.promise().query(
            'UPDATE appointments SET status = "отменена" WHERE id = ? AND master_id = ? AND status = "запланирована"',
            [appointmentId, req.session.user.id]
        );
        
        if (result.affectedRows === 0) {
            req.session.errors = [{ msg: 'Не удалось отменить запись' }];
        }
        
        res.redirect('/');
    } catch (error) {
        console.error('Ошибка при отмене записи мастером:', error);
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


// Функции админа

exports.adminUsers = async (req, res) => {
    try {
        if (req.session.user?.role_id !== 3) {
            return res.redirect('/');
        }

        const searchQuery = req.query.search || '';
        const searchParam = `%${searchQuery}%`;

        // Обновленный запрос с поиском
        const [users] = await db.promise().query(`
            SELECT u.id, u.email, u.full_name, u.gender, u.phone, 
                   r.name as role_name, u.role_id, 
                   b.name as branch_name, u.branch_id
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN branches b ON u.branch_id = b.id
            WHERE u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?
            ORDER BY u.role_id, u.full_name
        `, [searchParam, searchParam, searchParam]);

        const [branches] = await db.promise().query('SELECT * FROM branches');
        const [roles] = await db.promise().query('SELECT * FROM roles');

        res.render('adminUsers', {
            title: 'Управление пользователями',
            isAuthenticated: true,
            user: req.session.user,
            users,
            branches,
            roles,
            errors: req.session.errors,
            searchQuery
        });

        req.session.errors = null;
    } catch (error) {
        console.error('Ошибка при загрузке пользователей:', error);
        res.redirect('/admin');
    }
};


exports.updateUser = async (req, res) => {
    try {
        if (req.session.user?.role_id !== 3) {
            return res.redirect('/');
        }

        const { id } = req.params;
        const { role_id, branch_id } = req.body;

        // Проверяем, что не пытаемся изменить другого администратора
        const [currentUser] = await db.promise().query(
            'SELECT role_id FROM users WHERE id = ?',
            [id]
        );

        if (currentUser[0].role_id === 3 && req.session.user.id !== parseInt(id)) {
            req.session.errors = [{ msg: 'Нельзя изменять других администраторов' }];
            return res.redirect('/admin/users');
        }

        // Валидация для мастера
        if (role_id == 2 && !branch_id) {
            req.session.errors = [{ msg: 'Для мастера должен быть выбран филиал' }];
            return res.redirect('/admin/users');
        }

        // Обновляем пользователя
        await db.promise().query(
            'UPDATE users SET role_id = ?, branch_id = ? WHERE id = ?',
            [role_id, role_id == 2 ? branch_id : null, id]
        );

        res.redirect('/admin/users');
    } catch (error) {
        console.error('Ошибка при обновлении пользователя:', error);
        req.session.errors = [{ msg: 'Ошибка при обновлении пользователя' }];
        res.redirect('/admin/users');
    }
};

exports.adminStats = async (req, res) => {
    try {
        if (req.session.user?.role_id !== 3) {
            return res.redirect('/');
        }

        const [appointmentStats] = await db.promise().query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'запланирована' THEN 1 ELSE 0 END) as planned,
                SUM(CASE WHEN status = 'выполнена' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'отменена' THEN 1 ELSE 0 END) as canceled,
                AVG(CASE WHEN status = 'выполнена' THEN final_price ELSE NULL END) as avg_price,
                SUM(CASE WHEN status = 'выполнена' THEN final_price ELSE 0 END) as total_income
            FROM appointments
        `);

        const [serviceStats] = await db.promise().query(`
            SELECT h.title, COUNT(*) as count 
            FROM appointments a
            JOIN haircuts h ON a.haircut_id = h.id
            GROUP BY h.title
            ORDER BY count DESC
            LIMIT 5
        `);

        const [masterStats] = await db.promise().query(`
            SELECT u.full_name, COUNT(*) as count, SUM(a.final_price) as total
            FROM appointments a
            JOIN users u ON a.master_id = u.id
            WHERE a.status = 'выполнена'
            GROUP BY u.full_name
            ORDER BY total DESC
            LIMIT 5
        `);

        res.render('adminStats', {
            title: 'Статистика',
            isAuthenticated: true,
            user: req.session.user,
            appointmentStats: appointmentStats[0],
            serviceStats,
            masterStats
        });
    } catch (error) {
        console.error('Ошибка при загрузке статистики:', error);
        res.redirect('/admin');
    }
};

exports.exportStats = async (req, res) => {
    try {
        if (req.session.user?.role_id !== 3) {
            return res.redirect('/');
        }

        const [stats] = await db.promise().query(`
            SELECT 
                a.id,
                u1.full_name as client_name,
                u2.full_name as master_name,
                h.title as service,
                b.name as branch,
                a.appointment_time,
                a.status,
                a.final_price,
                a.completed_date
            FROM appointments a
            JOIN users u1 ON a.client_id = u1.id
            JOIN users u2 ON a.master_id = u2.id
            JOIN haircuts h ON a.haircut_id = h.id
            JOIN branches b ON a.branch_id = b.id
            ORDER BY a.appointment_time DESC
        `);

        let csv = 'ID,Клиент,Мастер,Услуга,Филиал,Дата записи,Статус,Цена,Дата выполнения\n';
        
        stats.forEach(row => {
            csv += `"${row.id}","${row.client_name}","${row.master_name}","${row.service}",` +
                   `"${row.branch}","${row.appointment_time}","${row.status}",` +
                   `"${row.final_price || ''}","${row.completed_date || ''}"\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('statistics.csv');
        res.send(csv);
    } catch (error) {
        console.error('Ошибка при экспорте статистики:', error);
        res.redirect('/admin/stats');
    }
};