import { Pool } from 'pg';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

let postgresPool = null;
let mongoConnection = null;
let redisClient = null;

/**
 * PostgreSQL Connection Pool
 */
export const connectPostgreSQL = async () => {
  try {
    postgresPool = new Pool({
      host: config.postgresql.host,
      port: config.postgresql.port,
      database: config.postgresql.database,
      user: config.postgresql.user,
      password: config.postgresql.password,
      max: config.postgresql.maxConnections,
      idleTimeoutMillis: config.postgresql.idleTimeoutMillis,
      connectionTimeoutMillis: config.postgresql.connectionTimeoutMillis,
    });

    // Test connection
    const client = await postgresPool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();

    logger.info(`PostgreSQL connected successfully at ${config.postgresql.host}:${config.postgresql.port}/${config.postgresql.database}`);
    return postgresPool;
  } catch (error) {
    logger.error('PostgreSQL connection failed:', error);
    throw error;
  }
};

/**
 * MongoDB Connection
 */
export const connectMongoDB = async () => {
  try {
    mongoose.set('strictQuery', false);
    
    mongoConnection = await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    
    logger.info(`MongoDB connected successfully to ${config.mongodb.uri}`);
    return mongoConnection;
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    throw error;
  }
};

/**
 * Redis Connection
 */
export const connectRedis = async () => {
  try {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      retryDelayOnFailover: config.redis.retryDelayOnFailover,
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    redisClient.on('connect', () => {
      logger.info(`Redis connected successfully at ${config.redis.host}:${config.redis.port}`);
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    // Test connection
    await redisClient.ping();
    
    return redisClient;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
};

/**
 * Get PostgreSQL Pool instance
 */
export const getPostgresPool = () => {
  if (!postgresPool) {
    throw new Error('PostgreSQL not initialized. Call connectPostgreSQL first.');
  }
  return postgresPool;
};

/**
 * Get MongoDB connection instance
 */
export const getMongoConnection = () => {
  if (!mongoConnection) {
    throw new Error('MongoDB not initialized. Call connectMongoDB first.');
  }
  return mongoConnection;
};

/**
 * Get Redis client instance
 */
export const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call connectRedis first.');
  }
  return redisClient;
};

/**
 * Close all database connections
 */
export const closeAllConnections = async () => {
  const errors = [];

  try {
    if (postgresPool) {
      await postgresPool.end();
      logger.info('PostgreSQL pool closed');
    }
  } catch (error) {
    errors.push({ database: 'PostgreSQL', error });
  }

  try {
    if (mongoConnection) {
      await mongoose.disconnect();
      logger.info('MongoDB connection closed');
    }
  } catch (error) {
    errors.push({ database: 'MongoDB', error });
  }

  try {
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis connection closed');
    }
  } catch (error) {
    errors.push({ database: 'Redis', error });
  }

  if (errors.length > 0) {
    logger.error('Errors while closing connections:', errors);
  }
};

export default {
  connectPostgreSQL,
  connectMongoDB,
  connectRedis,
  getPostgresPool,
  getMongoConnection,
  getRedisClient,
  closeAllConnections,
};
