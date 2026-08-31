import * as User from '../models/Auth.js';
import jwt from 'jsonwebtoken';
import { setCache } from '../middleware/cacheMiddleware.js';

const generateToken = (user) => {
    return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

export const register = async (req, res) => {
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
        setCache(req, res, createdUser);
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
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
}