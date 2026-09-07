export const errorHandler = (err, req, res, next) => {
    console.error(`[Error] ${err.name}: ${err.message}`);
    
    const statusCode = err.statusCode || 500;
    const message = err.isOperational ? err.message : 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};
