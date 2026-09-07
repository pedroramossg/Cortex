import * as User from '../models/Auth.js';
import jwt from 'jsonwebtoken';
import { setCache, removeCache } from '../middleware/cacheMiddleware.js';

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

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const user = await User.findByEmail({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid password" });
        }

        const token = generateToken(user);
        setCache(req, res, user);
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
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

export const logout = async (req, res) => {
    try {
        const { userId } = req.user;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        removeCache(req, res, userId);
        return res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Logout failed" });
    }
}