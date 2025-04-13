const request = require('supertest');
const app = require('../app');
const db = require("../dataBase/db.js");
const bcrypt = require('bcrypt');

describe('User Registration and Login', () => {

    afterAll(async () => {
        await db.promise().query('DELETE FROM users WHERE email LIKE "testuser%@example.com"');
        db.end();
    });

    it('should register a new user', async () => {
        const res = await request(app)
            .post('/register')
            .send({
                email: 'testuser1@example.com',
                password: '123456',
                confirmPassword: '123456',
                full_name: 'Test User 1',
                gender: 'М',
                phone: '1234567890'
            });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/');
    });

    it('should not register with existing email', async () => {
        const passwordHash = await bcrypt.hash('123456', 10);
        await db.promise().query(
            'INSERT INTO users (email, password_hash, full_name, gender, phone, role_id) VALUES (?, ?, ?, ?, ?, ?)',
            ['testuser2@example.com', passwordHash, 'Test User 2', 'Ж', '1112223333', 1]
        );

        const res = await request(app)
            .post('/register')
            .send({
                email: 'testuser2@example.com',
                password: '123456',
                confirmPassword: '123456',
                full_name: 'Test User 2',
                gender: 'Ж',
                phone: '1112223333'
            });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/register');
    });

    it('should login with correct credentials', async () => {
        const passwordHash = await bcrypt.hash('123456', 10);
        await db.promise().query(
            'INSERT INTO users (email, password_hash, full_name, gender, phone, role_id) VALUES (?, ?, ?, ?, ?, ?)',
            ['testuser3@example.com', passwordHash, 'Login User', 'М', '9998887777', 1]
        );

        const res = await request(app)
            .post('/login')
            .send({
                email: 'testuser3@example.com',
                password: '123456'
            });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/');
    });

    it('should not login with incorrect password', async () => {
        const passwordHash = await bcrypt.hash('123456', 10);
        await db.promise().query(
            'INSERT INTO users (email, password_hash, full_name, gender, phone, role_id) VALUES (?, ?, ?, ?, ?, ?)',
            ['testuser4@example.com', passwordHash, 'Wrong Password', 'М', '0001112222', 1]
        );

        const res = await request(app)
            .post('/login')
            .send({
                email: 'testuser4@example.com',
                password: 'wrongpassword'
            });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/login');
    });
});
