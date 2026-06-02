import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'test' 
  ? '.env.test' 
  : process.env.NODE_ENV === 'production' 
    ? '.env.production' 
    : '.env.development';

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // Fallback

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.AUTH_SERVICE_PORT, 10) || 3001,
  
  // Database configurations
  postgresql: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
    database: process.env.POSTGRES_DB || 'fashion_marketplace',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    maxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS, 10) || 20,
    idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT, 10) || 10000,
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fashion_marketplace_auth',
    options: {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE, 10) || 10,
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SELECTION_TIMEOUT, 10) || 5000,
      socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT, 10) || 45000,
    }
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
  },
  
  // JWT Configuration
  jwt: {
    accessTokenSecret: process.env.JWT_ACCESS_TOKEN_SECRET || 'your-super-secret-access-token-key-change-in-production',
    refreshTokenSecret: process.env.JWT_REFRESH_TOKEN_SECRET || 'your-super-secret-refresh-token-key-change-in-production',
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
    issuer: process.env.JWT_ISSUER || 'fashion-marketplace-auth-service',
    audience: process.env.JWT_AUDIENCE || 'fashion-marketplace',
  },
  
  // Cookie Configuration
  cookieSecret: process.env.COOKIE_SECRET || 'your-cookie-secret-key-change-in-production',
  cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  cookieSecure: process.env.NODE_ENV === 'production',
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'strict',
  
  // Argon2 Configuration
  argon2: {
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST, 10) || 65536, // 64 MB
    timeCost: parseInt(process.env.ARGON2_TIME_COST, 10) || 3,
    parallelism: parseInt(process.env.ARGON2_PARALLELISM, 10) || 4,
    hashLength: parseInt(process.env.ARGON2_HASH_LENGTH, 10) || 32,
  },
  
  // Rate Limiting
  rateLimit: {
    points: parseInt(process.env.RATE_LIMIT_POINTS, 10) || 100,
    duration: parseInt(process.env.RATE_LIMIT_DURATION, 10) || 60, // seconds
    blockDuration: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION, 10) || 300, // seconds
  },
  
  // OTP Configuration
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5,
    length: parseInt(process.env.OTP_LENGTH, 10) || 6,
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 3,
  },
  
  // Email Configuration
  email: {
    provider: process.env.EMAIL_PROVIDER || 'nodemailer',
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
    smtpUser: process.env.SMTP_USER || '',
    smtpPassword: process.env.SMTP_PASSWORD || '',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@fashionmarketplace.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Fashion Marketplace',
  },
  
  // SMS Configuration (Twilio)
  sms: {
    provider: process.env.SMS_PROVIDER || 'twilio',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },
  
  // Allowed Origins for CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(','),
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  
  // Fraud Detection
  fraud: {
    maxLoginAttempts: parseInt(process.env.FRAUD_MAX_LOGIN_ATTEMPTS, 10) || 5,
    lockoutDurationMinutes: parseInt(process.env.FRAUD_LOCKOUT_DURATION, 10) || 30,
    suspiciousIpThreshold: parseInt(process.env.FRAUD_SUSPICIOUS_IP_THRESHOLD, 10) || 10,
    velocityCheckWindow: parseInt(process.env.FRAUD_VELOCITY_WINDOW, 10) || 300, // seconds
  },
  
  // Session Configuration
  session: {
    maxConcurrentSessions: parseInt(process.env.SESSION_MAX_CONCURRENT, 10) || 5,
    idleTimeout: parseInt(process.env.SESSION_IDLE_TIMEOUT, 10) || 1800000, // 30 minutes
    absoluteTimeout: parseInt(process.env.SESSION_ABSOLUTE_TIMEOUT, 10) || 604800000, // 7 days
  },
};

// Validate critical configuration in production
if (config.nodeEnv === 'production') {
  const requiredVars = [
    'JWT_ACCESS_TOKEN_SECRET',
    'JWT_REFRESH_TOKEN_SECRET',
    'COOKIE_SECRET',
    'POSTGRES_PASSWORD',
    'REDIS_PASSWORD',
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
  }
  
  // Warn if using default secrets
  if (config.jwt.accessTokenSecret.includes('your-super-secret')) {
    console.warn('WARNING: Using default JWT secret in production! Change immediately.');
  }
}

export default config;
