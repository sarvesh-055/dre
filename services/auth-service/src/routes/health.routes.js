import { Router } from 'express';
import { getPostgresPool, getMongoConnection, getRedisClient } from '../config/database.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * @route   GET /api/v1/health/live
 * @desc    Liveness probe - is the service running?
 * @access  Public
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString(),
    service: 'auth-service',
    version: '1.0.0',
  });
});

/**
 * @route   GET /api/v1/health/ready
 * @desc    Readiness probe - are all dependencies healthy?
 * @access  Public
 */
router.get('/ready', async (req, res) => {
  const healthStatus = {
    success: true,
    status: 'ready',
    timestamp: new Date().toISOString(),
    service: 'auth-service',
    dependencies: {},
  };
  
  let allHealthy = true;
  
  // Check PostgreSQL
  try {
    const pool = getPostgresPool();
    const result = await pool.query('SELECT 1');
    healthStatus.dependencies.postgresql = {
      status: 'healthy',
      responseTime: Date.now(),
    };
  } catch (error) {
    healthStatus.dependencies.postgresql = {
      status: 'unhealthy',
      error: error.message,
    };
    allHealthy = false;
  }
  
  // Check MongoDB
  try {
    const mongoose = await import('mongoose');
    if (mongoose.connection.readyState === 1) {
      healthStatus.dependencies.mongodb = {
        status: 'healthy',
        responseTime: Date.now(),
      };
    } else {
      throw new Error('MongoDB not connected');
    }
  } catch (error) {
    healthStatus.dependencies.mongodb = {
      status: 'unhealthy',
      error: error.message,
    };
    allHealthy = false;
  }
  
  // Check Redis
  try {
    const redisClient = getRedisClient();
    await redisClient.ping();
    healthStatus.dependencies.redis = {
      status: 'healthy',
      responseTime: Date.now(),
    };
  } catch (error) {
    healthStatus.dependencies.redis = {
      status: 'unhealthy',
      error: error.message,
    };
    allHealthy = false;
  }
  
  if (!allHealthy) {
    healthStatus.success = false;
    healthStatus.status = 'not_ready';
    return res.status(503).json(healthStatus);
  }
  
  res.status(200).json(healthStatus);
});

/**
 * @route   GET /api/v1/health/db
 * @desc    Detailed database health check
 * @access  Internal
 */
router.get('/db', async (req, res) => {
  const dbStatus = {
    timestamp: new Date().toISOString(),
    databases: {},
  };
  
  // PostgreSQL detailed check
  try {
    const pool = getPostgresPool();
    const startTime = Date.now();
    
    const queries = [
      { name: 'connection', sql: 'SELECT 1' },
      { name: 'users_count', sql: 'SELECT COUNT(*) FROM users' },
      { name: 'sessions_count', sql: 'SELECT COUNT(*) FROM sessions WHERE invalidated_at IS NULL' },
    ];
    
    const results = {};
    for (const query of queries) {
      const queryStart = Date.now();
      await pool.query(query.sql);
      results[query.name] = Date.now() - queryStart;
    }
    
    dbStatus.databases.postgresql = {
      status: 'healthy',
      totalResponseTime: Date.now() - startTime,
      queryTimes: results,
    };
  } catch (error) {
    dbStatus.databases.postgresql = {
      status: 'unhealthy',
      error: error.message,
    };
  }
  
  // MongoDB detailed check
  try {
    const mongoose = await import('mongoose');
    const startTime = Date.now();
    
    const collections = ['users', 'sessions', 'devices'];
    const results = {};
    
    for (const collection of collections) {
      const queryStart = Date.now();
      const count = await mongoose.connection.collection(collection).countDocuments({});
      results[collection] = {
        count,
        responseTime: Date.now() - queryStart,
      };
    }
    
    dbStatus.databases.mongodb = {
      status: 'healthy',
      totalResponseTime: Date.now() - startTime,
      collections: results,
    };
  } catch (error) {
    dbStatus.databases.mongodb = {
      status: 'unhealthy',
      error: error.message,
    };
  }
  
  // Redis detailed check
  try {
    const redisClient = getRedisClient();
    const startTime = Date.now();
    
    const info = await redisClient.info('stats');
    const keysCount = await redisClient.dbsize();
    
    dbStatus.databases.redis = {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      keysCount,
      memoryUsage: info ? 'available' : 'unknown',
    };
  } catch (error) {
    dbStatus.databases.redis = {
      status: 'unhealthy',
      error: error.message,
    };
  }
  
  res.status(200).json(dbStatus);
});

/**
 * @route   GET /api/v1/health/stats
 * @desc    Service statistics
 * @access  Internal
 */
router.get('/stats', async (req, res) => {
  try {
    const pool = getPostgresPool();
    const mongoose = await import('mongoose');
    
    const stats = {
      timestamp: new Date().toISOString(),
      postgresql: {},
      mongodb: {},
    };
    
    // PostgreSQL stats
    const pgQueries = [
      { name: 'totalUsers', sql: "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL" },
      { name: 'activeUsers', sql: "SELECT COUNT(*) FROM users WHERE is_active = TRUE AND deleted_at IS NULL" },
      { name: 'activeSessions', sql: "SELECT COUNT(*) FROM sessions WHERE invalidated_at IS NULL AND expires_at > NOW()" },
      { name: 'lockedUsers', sql: "SELECT COUNT(*) FROM users WHERE is_locked = TRUE" },
    ];
    
    for (const query of pgQueries) {
      const result = await pool.query(query.sql);
      stats.postgresql[query.name] = parseInt(result.rows[0].count, 10);
    }
    
    // MongoDB stats
    const mongoCollections = ['otp_cache', 'device_fingerprints', 'login_attempts'];
    for (const collection of mongoCollections) {
      try {
        const count = await mongoose.connection.collection(collection).countDocuments({});
        stats.mongodb[collection] = count;
      } catch (error) {
        stats.mongodb[collection] = 0;
      }
    }
    
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Health stats failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stats',
    });
  }
});

export default router;
