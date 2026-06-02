/**
 * =====================================================
 * FASHION MARKETPLACE - BACKEND EXPRESS SERVER SETUP
 * Enterprise Multi-Vendor E-Commerce Platform
 * =====================================================
 * Purpose: Security, API Versioning, Error Handling, DB Connections
 * Framework: Express.js with Node.js
 * =====================================================
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// =====================================================
// CONFIGURATION & ENVIRONMENT VALIDATION
// =====================================================

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiVersion: process.env.API_VERSION || 'v1',
  
  // Database
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
    database: process.env.POSTGRES_DB || 'fashion_marketplace',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    maxPoolSize: parseInt(process.env.POSTGRES_MAX_POOL, 10) || 20,
    minPoolSize: parseInt(process.env.POSTGRES_MIN_POOL, 10) || 5,
    connectionTimeout: parseInt(process.env.POSTGRES_TIMEOUT, 10) || 30000,
    idleTimeout: parseInt(process.env.POSTGRES_IDLE_TIMEOUT, 10) || 60000
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fashion_marketplace',
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL, 10) || 50,
    minPoolSize: parseInt(process.env.MONGO_MIN_POOL, 10) || 10,
    serverSelectionTimeoutMS: parseInt(process.env.MONGO_TIMEOUT, 10) || 5000,
    socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT, 10) || 45000
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100
  },
  
  meilisearch: {
    host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY || ''
  },
  
  // Security
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    issuer: process.env.JWT_ISSUER || 'fashion-marketplace'
  },
  
  session: {
    secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-in-production',
    cookieMaxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 24 * 60 * 60 * 1000
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    skipSuccessfulRequests: false
  },
  
  // CORS
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
  }
};

// Validate required environment variables in production
if (config.env === 'production') {
  const requiredVars = [
    'JWT_SECRET',
    'SESSION_SECRET',
    'POSTGRES_PASSWORD',
    'MONGODB_URI',
    'REDIS_PASSWORD'
  ];
  
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// =====================================================
// DATABASE CONNECTION POOLS
// =====================================================

// PostgreSQL Connection Pool
const postgresPool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: config.postgres.maxPoolSize,
  min: config.postgres.minPoolSize,
  connectionTimeoutMillis: config.postgres.connectionTimeout,
  idleTimeoutMillis: config.postgres.idleTimeout,
  allowExitOnIdle: false,
  ssl: config.env === 'production' ? { rejectUnauthorized: false } : false
});

// PostgreSQL event handlers
postgresPool.on('connect', () => {
  console.log('[PostgreSQL] New client connected');
});

postgresPool.on('error', (err, client) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

postgresPool.on('remove', () => {
  console.log('[PostgreSQL] Client removed from pool');
});

// MongoDB Connection
const connectMongoDB = async () => {
  try {
    await mongoose.connect(config.mongodb.uri, {
      maxPoolSize: config.mongodb.maxPoolSize,
      minPoolSize: config.mongodb.minPoolSize,
      serverSelectionTimeoutMS: config.mongodb.serverSelectionTimeoutMS,
      socketTimeoutMS: config.mongodb.socketTimeoutMS,
      retryWrites: true,
      retryReads: true
    });
    
    console.log('[MongoDB] Connected successfully');
    
    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected. Attempting to reconnect...');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Reconnected successfully');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err);
    });
    
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error.message);
    if (config.env === 'production') {
      throw error;
    }
  }
};

// Redis Connection
const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
  retryDelayOnFailover: config.redis.retryDelayOnFailover,
  retryStrategy: (times) => {
    if (times > 5) return null;
    return Math.min(times * 200, 3000);
  }
});

redisClient.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redisClient.on('error', (err) => {
  console.error('[Redis] Error:', err.message);
});

redisClient.on('close', () => {
  console.warn('[Redis] Connection closed');
});

// =====================================================
// EXPRESS APP INITIALIZATION
// =====================================================

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

// =====================================================
// SECURITY MIDDLEWARE
// =====================================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.fashionmarketplace.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (config.cors.origins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: config.cors.credentials,
  methods: config.cors.methods,
  allowedHeaders: config.cors.allowedHeaders,
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Request-ID'],
  maxAge: 86400
}));

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
  skip: (req) => req.path === '/health' || req.path === '/ready'
});

app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: { code: 'AUTH_RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts.' }
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(express.json({ limit: '10mb', strict: true, type: ['application/json', 'application/csp-report'] }));
app.use(express.urlencoded({ extended: true, limit: '10mb', parameterLimit: 1000 }));
app.use(cookieParser(config.session.secret));
app.use(mongoSanitize({ replaceWith: '_', allowDots: false }));
app.use(xss({ whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script'] }));
app.use(hpp({ whitelist: ['sort', 'fields', 'filter'] }));
app.use(compression({ level: 6, threshold: 1024 }));

// =====================================================
// REQUEST LOGGING & MONITORING
// =====================================================

app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  req.startTime = Date.now();
  next();
});

function generateRequestId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${randomPart}`;
}

app.use((req, res, next) => {
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    res.setHeader('X-Response-Time', `${duration}ms`);
  });
  next();
});

app.use((req, res, next) => {
  const log = {
    id: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  };
  console.log(`[REQUEST] ${JSON.stringify(log)}`);
  next();
});

// =====================================================
// CSRF PROTECTION
// =====================================================

const csrfMiddleware = (req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  
  if (safeMethods.includes(req.method)) {
    if (!req.cookies.csrf_token) {
      const token = generateCSRFToken();
      res.cookie('csrf_token', token, {
        httpOnly: false,
        secure: config.env === 'production',
        sameSite: 'strict',
        maxAge: config.session.cookieMaxAge
      });
      res.locals.csrfToken = token;
    } else {
      res.locals.csrfToken = req.cookies.csrf_token;
    }
    return next();
  }
  
  const token = req.headers['x-csrf-token'] || req.body._csrf || req.query._csrf;
  
  if (!token || !validateCSRFToken(token)) {
    return res.status(403).json({
      success: false,
      error: { code: 'CSRF_VALIDATION_FAILED', message: 'Invalid or missing CSRF token' }
    });
  }
  
  next();
};

function generateCSRFToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

function validateCSRFToken(token) {
  return token && typeof token === 'string' && token.length === 64;
}

app.use('/api/', csrfMiddleware);

// =====================================================
// API VERSIONING & ROUTES
// =====================================================

const API_BASE = `/api/${config.apiVersion}`;

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env
  });
});

app.get('/ready', async (req, res) => {
  try {
    const postgresCheck = await postgresPool.query('SELECT 1');
    const mongoCheck = mongoose.connection.readyState === 1;
    const redisCheck = await redisClient.ping();
    const isReady = postgresCheck && mongoCheck && redisCheck === 'PONG';
    
    res.status(isReady ? 200 : 503).json({
      success: isReady,
      status: isReady ? 'ready' : 'not_ready',
      checks: { postgres: !!postgresCheck, mongodb: mongoCheck, redis: redisCheck === 'PONG' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Placeholder route files - will be implemented in Phase 2+
const createPlaceholderRoute = (name) => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => {
    res.json({ success: true, message: `${name} service endpoint`, version: config.apiVersion });
  });
  return router;
};

app.use(`${API_BASE}/auth`, createPlaceholderRoute('Auth'));
app.use(`${API_BASE}/vendors`, createPlaceholderRoute('Vendor'));
app.use(`${API_BASE}/catalog`, createPlaceholderRoute('Catalog'));
app.use(`${API_BASE}/orders`, createPlaceholderRoute('Order'));
app.use(`${API_BASE}/payments`, createPlaceholderRoute('Payment'));
app.use(`${API_BASE}/search`, createPlaceholderRoute('Search'));
app.use(`${API_BASE}/loyalty`, createPlaceholderRoute('Loyalty'));
app.use(`${API_BASE}/shipping`, createPlaceholderRoute('Shipping'));
app.use(`${API_BASE}/notifications`, createPlaceholderRoute('Notification'));
app.use(`${API_BASE}/analytics`, createPlaceholderRoute('Analytics'));

// =====================================================
// ERROR HANDLING
// =====================================================

app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      path: req.path,
      method: req.method
    }
  });
});

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.id}:`, err);
  
  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';
  
  if (config.env === 'production' && statusCode === 500) {
    message = 'An unexpected error occurred. Please try again later.';
  }
  
  logErrorToDatabase(err, req).catch(console.error);
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: message,
      ...(config.env === 'development' && { stack: err.stack }),
      requestId: req.id,
      timestamp: new Date().toISOString()
    }
  });
});

async function logErrorToDatabase(error, req) {
  try {
    const errorLog = {
      errorType: error.constructor.name,
      errorMessage: error.message,
      stackTrace: error.stack,
      service: 'api-gateway',
      endpoint: req.path,
      method: req.method,
      userId: req.user?.id || null,
      severity: error.statusCode >= 500 ? 'error' : 'warning',
      metadata: {
        requestId: req.id,
        userAgent: req.get('user-agent'),
        ip: req.ip,
        body: req.body,
        query: req.query,
        params: req.params
      },
      timestamp: new Date()
    };
    
    const { ErrorLog } = require('../../database/mongodb/schemas');
    await ErrorLog.create(errorLog);
  } catch (logError) {
    console.error('[ERROR] Failed to log error to database:', logError);
  }
}

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

const gracefulShutdown = async (signal) => {
  console.log(`\n[${signal}] Received shutdown signal. Starting graceful shutdown...`);
  
  const shutdownTimeout = setTimeout(() => {
    console.error('[SHUTDOWN] Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
  
  try {
    await new Promise((resolve) => server.close(resolve));
    console.log('[SHUTDOWN] HTTP server closed');
    
    await postgresPool.end();
    console.log('[SHUTDOWN] PostgreSQL pool closed');
    
    await mongoose.connection.close();
    console.log('[SHUTDOWN] MongoDB connection closed');
    
    await redisClient.quit();
    console.log('[SHUTDOWN] Redis connection closed');
    
    clearTimeout(shutdownTimeout);
    console.log('[SHUTDOWN] Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('[SHUTDOWN] Error during graceful shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// =====================================================
// SERVER STARTUP
// =====================================================

const server = app.listen(config.port, async () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     FASHION MARKETPLACE - API SERVER                     ║
╠══════════════════════════════════════════════════════════╣
║  Environment:      ${config.env.padEnd(42)} ║
║  Port:             ${String(config.port).padEnd(42)} ║
║  API Version:      ${config.apiVersion.padEnd(42)} ║
║  JWT Expiry:       ${config.jwt.accessTokenExpiry.padEnd(42)} ║
╚══════════════════════════════════════════════════════════╝
  `);
  
  await connectMongoDB();
  
  try {
    const result = await postgresPool.query('SELECT NOW()');
    console.log('[PostgreSQL] Connection test successful:', result.rows[0].now);
  } catch (error) {
    console.error('[PostgreSQL] Connection test failed:', error.message);
    if (config.env === 'production') throw error;
  }
  
  try {
    const pong = await redisClient.ping();
    console.log('[Redis] Ping test successful:', pong);
  } catch (error) {
    console.error('[Redis] Ping test failed:', error.message);
    if (config.env === 'production') throw error;
  }
  
  console.log('\n[SERVER] All systems operational. Ready to accept requests.\n');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[SERVER] Port ${config.port} is already in use`);
  } else {
    console.error('[SERVER] Server error:', error);
  }
  process.exit(1);
});

module.exports = { app, server, postgresPool, redisClient, config, gracefulShutdown };
