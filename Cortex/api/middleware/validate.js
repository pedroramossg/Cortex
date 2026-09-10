export const validate = (schema) => {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: "Validation Error",
                errors: error.errors || error.issues
            });
        }
    };
};

export const validateQuery = (schema) => {
    return (req, res, next) => {
        try {
            const parsed = schema.parse(req.query);
            for (const key of Object.keys(req.query)) {
                delete req.query[key];
            }
            Object.assign(req.query, parsed);
            req.validatedQuery = parsed;
            next();
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: "Validation Error",
                errors: error.errors || error.issues
            });
        }
    };
};

