const express = require("express");
const userController = require("../controllers/userController.js");
const userRouter = express.Router();
const { registerValidation, loginValidation } = require("../middleware/validation"); 
const { uploadAvatar, updateProfile, updateAccount, settingsPage } = require('../controllers/userController');
const db = require("../dataBase/db.js");

userRouter.get("/register", userController.registerForm);
userRouter.post("/register", registerValidation, userController.register);

userRouter.get("/login", userController.loginForm);
userRouter.post("/login", loginValidation, userController.login);

userRouter.get("/settings", settingsPage);


userRouter.post("/settings/profile", uploadAvatar, updateProfile);
userRouter.post("/settings/account", updateAccount);

userRouter.get("/logout", userController.logout); 

userRouter.get("/appointments/new", userController.newAppointmentForm);
userRouter.post("/appointments", userController.createAppointment);

userRouter.get("/api/masters", async (req, res) => {
    try {
        const { branch_id } = req.query;
        if (!branch_id) {
            return res.status(400).json({ error: 'branch_id is required' });
        }

        const [masters] = await db.promise().query(
            'SELECT id, full_name, gender FROM users WHERE branch_id = ? AND role_id = 2',
            [branch_id]
        );

        res.json(masters);
    } catch (error) {
        console.error('Ошибка получения мастеров:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

userRouter.get("/appointments/:id/edit", userController.editAppointmentForm);
userRouter.post("/appointments/:id", userController.updateAppointment);
userRouter.get("/appointments/:id/cancel", userController.cancelAppointment);

userRouter.post("/appointments/:id/complete", userController.completeAppointment);

module.exports = userRouter;