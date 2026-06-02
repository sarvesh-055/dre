import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

/**
 * Request Logger Middleware
 * Adds unique request ID and logs request/response details
 */
export const requestLogger = (req, res, next) => {
  // Generate unique request ID
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  
  // Record start time for response time calculation
  const startTime = Date.now();
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override end function to log after response is sent
  res.end = function(chunk, encoding) {
    // Restore original end function
    res.end = originalEnd;
    
    // Call original end function
    const returned = res.end(chunk, encoding);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log request details
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id || 'anonymous',
    });
    
    return returned;
  };
  
  // Set request ID in response headers
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

/**
 * Request ID extractor helper
 */
export const extractRequestId = (req) => {
  return req.headers['x-request-id'] || req.requestId || 'unknown';
};

export default { requestLogger, extractRequestId };
