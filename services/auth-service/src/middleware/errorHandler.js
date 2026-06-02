import { AppError, StatusCodes, ErrorCodes } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Global Error Handler Middleware
 * Handles all errors consistently across the application
 */
export const errorHandler = (err, req, res, next) => {
  // Set default values
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  let message = err.message || 'Internal server error';
  let code = err.code || ErrorCodes.INTERNAL_SERVER_ERROR;
  let isOperational = err.isOperational !== undefined ? err.isOperational : false;
  
  // Log the error
  if (statusCode >= 500) {
    logger.error('Unhandled error:', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
    });
  } else if (statusCode >= 400) {
    logger.warn('Client error:', {
      error: err.message,
      code,
      statusCode,
      path: req.path,
      method: req.method,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
  }
  
  // Handle specific error types
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = StatusCodes.BAD_REQUEST;
    code = ErrorCodes.VALIDATION_ERROR;
    message = Object.values(err.errors).map(e => e.message).join(', ');
    isOperational = true;
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = StatusCodes.CONFLICT;
    code = ErrorCodes.DUPLICATE_ENTRY;
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value for field: ${field}`;
    isOperational = true;
  }
  
  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = StatusCodes.BAD_REQUEST;
    code = ErrorCodes.INVALID_INPUT;
    message = `Invalid ${err.path}: ${err.value}`;
    isOperational = true;
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = StatusCodes.UNAUTHORIZED;
    code = ErrorCodes.TOKEN_INVALID;
    message = 'Invalid token';
    isOperational = true;
  }
  
  if (err.name === 'TokenExpiredError') {
    statusCode = StatusCodes.UNAUTHORIZED;
    code = ErrorCodes.TOKEN_EXPIRED;
    message = 'Token has expired';
    isOperational = true;
  }
  
  // PostgreSQL unique violation
  if (err.code === '23505') {
    statusCode = StatusCodes.CONFLICT;
    code = ErrorCodes.DUPLICATE_ENTRY;
    const detail = err.detail || '';
    const match = detail.match(/Key \(([^)]+)\)/);
    const field = match ? match[1] : 'unknown';
    message = `Duplicate value for field: ${field}`;
    isOperational = true;
  }
  
  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    statusCode = StatusCodes.BAD_REQUEST;
    code = ErrorCodes.INVALID_INPUT;
    message = 'Referenced resource does not exist';
    isOperational = true;
  }
  
  // PostgreSQL check constraint violation
  if (err.code === '23514') {
    statusCode = StatusCodes.BAD_REQUEST;
    code = ErrorCodes.VALIDATION_ERROR;
    message = 'Data violates database constraint';
    isOperational = true;
  }
  
  // Build response
  const errorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };
  
  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && !isOperational) {
    errorResponse.error.stack = err.stack;
  }
  
  // Include validation details if available
  if (err.details) {
    errorResponse.error.details = err.details;
  }
  
  // Send response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch errors and pass them to the error handler
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not Found Handler
 * Handles 404 errors for undefined routes
 */
export const notFoundHandler = (req, res, next) => {
  const err = new AppError(
    `Route ${req.method} ${req.originalUrl} not found`,
    StatusCodes.NOT_FOUND,
    ErrorCodes.NOT_FOUND
  );
  next(err);
};

export default {
  errorHandler,
  asyncHandler,
  notFoundHandler,
};
