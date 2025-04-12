const db = require("../dataBase/db.js");

exports.index = async (req, res) => {
    try {
        let appointments = [];
        
        if (req.session.user) {
            // Для клиентов показываем их записи
            if (req.session.user.role_id === 1) { // client
                [appointments] = await db.promise().query(`
                    SELECT a.*, 
                           b.name AS branch_name,
                           h.title AS haircut_title,
                           h.base_price,
                           u.full_name AS master_name
                    FROM appointments a
                    JOIN branches b ON a.branch_id = b.id
                    JOIN haircuts h ON a.haircut_id = h.id
                    JOIN users u ON a.master_id = u.id
                    WHERE a.client_id = ?
                    ORDER BY a.appointment_time DESC
                    LIMIT 5
                `, [req.session.user.id]);
            }
            // Для мастеров показываем их записи
            else if (req.session.user.role_id === 2) { // master
                [appointments] = await db.promise().query(`
                    SELECT a.*, 
                           b.name AS branch_name,
                           h.title AS haircut_title,
                           h.base_price,
                           u.full_name AS client_name
                    FROM appointments a
                    JOIN branches b ON a.branch_id = b.id
                    JOIN haircuts h ON a.haircut_id = h.id
                    JOIN users u ON a.client_id = u.id
                    WHERE a.master_id = ?
                    ORDER BY a.appointment_time DESC
                    LIMIT 5
                `, [req.session.user.id]);
            }
        }

        res.render("index.handlebars", { 
            documentName: 'main', 
            isAuthenticated: req.session.user !== undefined,
            user: req.session.user,
            appointments: appointments
        });
        
    } catch (error) {
        console.error("Ошибка при загрузке главной страницы:", error);
        res.render("index.handlebars", { 
            documentName: 'main', 
            isAuthenticated: req.session.user !== undefined,
            user: req.session.user,
            appointments: []
        });
    }
};