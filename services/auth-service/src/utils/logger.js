import winston from 'winston';
import { config } from './index.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format for development
const devFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  if (stack) {
    msg += `\n${stack}`;
  }
  
  return msg;
});

// Custom log format for production (JSON)
const prodFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  const logEntry = {
    timestamp,
    level,
    message,
    service: 'auth-service',
  };
  
  if (stack) {
    logEntry.stack = stack;
  }
  
  if (Object.keys(metadata).length > 0) {
    Object.assign(logEntry, metadata);
  }
  
  return JSON.stringify(logEntry);
});

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'cyan',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(logColors);

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  levels: logLevels,
  
  // Log all transports unless in test mode
  silent: config.nodeEnv === 'test',
  
  transports: [
    // Console transport
    new winston.transports.Console({
      format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        config.nodeEnv === 'production' ? prodFormat : combine(colorize(), devFormat)
      ),
    }),
    
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        prodFormat
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        prodFormat
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  
  // Exit on unhandled exceptions
  exitOnError: false,
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'logs/exceptions.log',
      format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        prodFormat
      ),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: 'logs/rejections.log',
      format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        prodFormat
      ),
    }),
  ],
});

// Create a stream object for Morgan HTTP logging
export const morganStream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

/**
 * Log security-related events
 */
export const logSecurityEvent = (eventType, details) => {
  logger.warn('Security Event', {
    eventType,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Log authentication events
 */
export const logAuthEvent = (eventType, userId, details = {}) => {
  logger.info('Authentication Event', {
    eventType,
    userId,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Log fraud detection events
 */
export const logFraudEvent = (riskLevel, userId, details = {}) => {
  const logMethod = riskLevel === 'HIGH' ? 'error' : riskLevel === 'MEDIUM' ? 'warn' : 'info';
  
  logger[logMethod]('Fraud Detection Event', {
    riskLevel,
    userId,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

export default logger;
