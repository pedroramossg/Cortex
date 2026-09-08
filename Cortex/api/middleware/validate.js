export const validate = (schema) => {
    return (req, res, next) => {
        try {
            // Zod's parse method throws an error if validation fails
            schema.parse(req.body);
            next();
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: "Validation Error",
                errors: error.errors
            });
        }
    };
};
