const { check } = require('express-validator');

exports.registerValidation = [
    check('email')
        .isEmail().withMessage('Введите корректный email')
        .normalizeEmail(),
        
    check('password')
        .isLength({ min: 3 }).withMessage('Пароль должен быть не менее 3 символов')
        .matches(/\d/).withMessage('Пароль должен содержать хотя бы одну цифру'),
        
    check('full_name')
        .notEmpty().withMessage('Введите ваше имя')
        .isLength({ max: 40 }).withMessage('Имя слишком длинное'),
        
    check('gender')
        .isIn(['М', 'Ж']).withMessage('Выберите пол'),
        
    check('phone')
        .optional({ checkFalsy: true })
        .isMobilePhone().withMessage('Введите корректный номер телефона')
];

exports.loginValidation = [
    check('email')
        .isEmail().withMessage('Введите корректный email')
        .normalizeEmail(),
        
    check('password')
        .notEmpty().withMessage('Введите пароль')
];