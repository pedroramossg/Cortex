import * as User from '../models/Auth.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { setCache, removeCache } from '../middleware/cacheMiddleware.js';

const generateToken = (user) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined in environment variables');
    }
    return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

export const register = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const existingUser = await User.findByEmail({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const createdUser = await User.createUser({ name, email, password });

        const token = generateToken(createdUser);

        const cacheKey = `user_session:${createdUser.id}`;
        await setCache(req, res, createdUser, cacheKey, 3600 * 24 * 30);

        return res.status(201).json({
            message: "User created successfully",
            data: {
                user: {
                    id: createdUser.id,
                    email: createdUser.email,
                    name: createdUser.name
                },
                token
            }
        });
    } catch (error) {
        next(error);
    }
}

export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const user = await User.findByEmail({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = generateToken(user);

        const cacheKey = `user_session:${user.id}`;
        await setCache(req, res, user, cacheKey, 3600 * 24 * 30);

        return res.status(200).json({
            message: "Login successful",
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name
                },
                token
            }
        });
    } catch (error) {
        next(error);
    }
}

export const logout = async (req, res, next) => {
    try {
        const id = req.user?.id || req.user?.userId;

        if (!id) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const cacheKey = `user_session:${id}`;
        await removeCache(req, res, cacheKey);

        return res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        next(error);
    }
}