/**
 * Custom Application Error Class
 */
export class AppError extends Error {
  constructor(message, statusCode, code, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error Codes
 */
export const ErrorCodes = {
  // Authentication Errors (401)
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_MAX_ATTEMPTS_EXCEEDED: 'OTP_MAX_ATTEMPTS_EXCEEDED',
  
  // Authorization Errors (403)
  ACCESS_DENIED: 'ACCESS_DENIED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  
  // User Errors (400/404)
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  PHONE_ALREADY_EXISTS: 'PHONE_ALREADY_EXISTS',
  USERNAME_ALREADY_EXISTS: 'USERNAME_ALREADY_EXISTS',
  USER_LOCKED: 'USER_LOCKED',
  USER_DISABLED: 'USER_DISABLED',
  
  // Vendor Errors (400/404)
  VENDOR_NOT_FOUND: 'VENDOR_NOT_FOUND',
  VENDOR_ALREADY_EXISTS: 'VENDOR_ALREADY_EXISTS',
  VENDOR_PENDING_APPROVAL: 'VENDOR_PENDING_APPROVAL',
  VENDOR_REJECTED: 'VENDOR_REJECTED',
  VENDOR_SUSPENDED: 'VENDOR_SUSPENDED',
  KYC_NOT_SUBMITTED: 'KYC_NOT_SUBMITTED',
  KYC_PENDING: 'KYC_PENDING',
  KYC_REJECTED: 'KYC_REJECTED',
  
  // Validation Errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // Database Errors (500)
  DATABASE_ERROR: 'DATABASE_ERROR',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  
  // Rate Limiting Errors (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  
  // Fraud Detection Errors (403)
  FRAUD_DETECTED: 'FRAUD_DETECTED',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  IP_BLOCKED: 'IP_BLOCKED',
  DEVICE_BLOCKED: 'DEVICE_BLOCKED',
  
  // Server Errors (500)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  
  // Not Found Errors (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
};

/**
 * HTTP Status Codes
 */
export const StatusCodes = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Error Factory Functions
 */
export const errors = {
  // Authentication Errors
  invalidCredentials: () => new AppError('Invalid email or password', StatusCodes.UNAUTHORIZED, ErrorCodes.INVALID_CREDENTIALS),
  tokenExpired: () => new AppError('Access token has expired', StatusCodes.UNAUTHORIZED, ErrorCodes.TOKEN_EXPIRED),
  tokenInvalid: () => new AppError('Invalid access token', StatusCodes.UNAUTHORIZED, ErrorCodes.TOKEN_INVALID),
  refreshTokenExpired: () => new AppError('Refresh token has expired', StatusCodes.UNAUTHORIZED, ErrorCodes.REFRESH_TOKEN_EXPIRED),
  sessionExpired: () => new AppError('Session has expired', StatusCodes.UNAUTHORIZED, ErrorCodes.SESSION_EXPIRED),
  otpExpired: () => new AppError('OTP has expired', StatusCodes.BAD_REQUEST, ErrorCodes.OTP_EXPIRED),
  otpInvalid: () => new AppError('Invalid OTP', StatusCodes.BAD_REQUEST, ErrorCodes.OTP_INVALID),
  otpMaxAttemptsExceeded: () => new AppError('Maximum OTP attempts exceeded', StatusCodes.FORBIDDEN, ErrorCodes.OTP_MAX_ATTEMPTS_EXCEEDED),
  
  // Authorization Errors
  accessDenied: () => new AppError('Access denied', StatusCodes.FORBIDDEN, ErrorCodes.ACCESS_DENIED),
  insufficientPermissions: (permission) => new AppError(`Insufficient permissions: ${permission}`, StatusCodes.FORBIDDEN, ErrorCodes.INSUFFICIENT_PERMISSIONS),
  roleNotFound: (roleId) => new AppError(`Role not found: ${roleId}`, StatusCodes.NOT_FOUND, ErrorCodes.ROLE_NOT_FOUND),
  
  // User Errors
  userNotFound: (userId) => new AppError(`User not found: ${userId}`, StatusCodes.NOT_FOUND, ErrorCodes.USER_NOT_FOUND),
  userAlreadyExists: () => new AppError('User already exists', StatusCodes.CONFLICT, ErrorCodes.USER_ALREADY_EXISTS),
  emailAlreadyExists: (email) => new AppError(`Email already registered: ${email}`, StatusCodes.CONFLICT, ErrorCodes.EMAIL_ALREADY_EXISTS),
  phoneAlreadyExists: (phone) => new AppError(`Phone number already registered: ${phone}`, StatusCodes.CONFLICT, ErrorCodes.PHONE_ALREADY_EXISTS),
  usernameAlreadyExists: (username) => new AppError(`Username already taken: ${username}`, StatusCodes.CONFLICT, ErrorCodes.USERNAME_ALREADY_EXISTS),
  userLocked: () => new AppError('Account is locked due to too many failed attempts', StatusCodes.FORBIDDEN, ErrorCodes.USER_LOCKED),
  userDisabled: () => new AppError('Account has been disabled', StatusCodes.FORBIDDEN, ErrorCodes.USER_DISABLED),
  
  // Vendor Errors
  vendorNotFound: (vendorId) => new AppError(`Vendor not found: ${vendorId}`, StatusCodes.NOT_FOUND, ErrorCodes.VENDOR_NOT_FOUND),
  vendorAlreadyExists: () => new AppError('Vendor already exists', StatusCodes.CONFLICT, ErrorCodes.VENDOR_ALREADY_EXISTS),
  vendorPendingApproval: () => new AppError('Vendor application is pending approval', StatusCodes.FORBIDDEN, ErrorCodes.VENDOR_PENDING_APPROVAL),
  vendorRejected: () => new AppError('Vendor application was rejected', StatusCodes.FORBIDDEN, ErrorCodes.VENDOR_REJECTED),
  vendorSuspended: () => new AppError('Vendor account has been suspended', StatusCodes.FORBIDDEN, ErrorCodes.VENDOR_SUSPENDED),
  kycNotSubmitted: () => new AppError('KYC documents not submitted', StatusCodes.BAD_REQUEST, ErrorCodes.KYC_NOT_SUBMITTED),
  kycPending: () => new AppError('KYC verification is pending', StatusCodes.FORBIDDEN, ErrorCodes.KYC_PENDING),
  kycRejected: (reason) => new AppError(`KYC verification rejected: ${reason}`, StatusCodes.FORBIDDEN, ErrorCodes.KYC_REJECTED),
  
  // Validation Errors
  validationError: (details) => {
    const error = new AppError('Validation error', StatusCodes.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR);
    error.details = details;
    return error;
  },
  invalidInput: (field) => new AppError(`Invalid input for field: ${field}`, StatusCodes.BAD_REQUEST, ErrorCodes.INVALID_INPUT),
  
  // Database Errors
  databaseError: (message) => {
    const error = new AppError(message || 'Database error occurred', StatusCodes.INTERNAL_SERVER_ERROR, ErrorCodes.DATABASE_ERROR, false);
    return error;
  },
  duplicateEntry: (field) => new AppError(`Duplicate entry for field: ${field}`, StatusCodes.CONFLICT, ErrorCodes.DUPLICATE_ENTRY),
  
  // Rate Limiting Errors
  rateLimitExceeded: () => new AppError('Rate limit exceeded. Please try again later.', StatusCodes.TOO_MANY_REQUESTS, ErrorCodes.RATE_LIMIT_EXCEEDED),
  tooManyRequests: () => new AppError('Too many requests. Please slow down.', StatusCodes.TOO_MANY_REQUESTS, ErrorCodes.TOO_MANY_REQUESTS),
  
  // Fraud Detection Errors
  fraudDetected: (reason) => new AppError(`Fraud detected: ${reason}`, StatusCodes.FORBIDDEN, ErrorCodes.FRAUD_DETECTED),
  suspiciousActivity: () => new AppError('Suspicious activity detected. Please verify your identity.', StatusCodes.FORBIDDEN, ErrorCodes.SUSPICIOUS_ACTIVITY),
  ipBlocked: () => new AppError('Your IP address has been blocked', StatusCodes.FORBIDDEN, ErrorCodes.IP_BLOCKED),
  deviceBlocked: () => new AppError('Your device has been blocked', StatusCodes.FORBIDDEN, ErrorCodes.DEVICE_BLOCKED),
  
  // Server Errors
  internalServerError: (message) => {
    const error = new AppError(message || 'Internal server error', StatusCodes.INTERNAL_SERVER_ERROR, ErrorCodes.INTERNAL_SERVER_ERROR, false);
    return error;
  },
  serviceUnavailable: () => new AppError('Service temporarily unavailable', StatusCodes.SERVICE_UNAVAILABLE, ErrorCodes.SERVICE_UNAVAILABLE),
  
  // Not Found Errors
  notFound: (resource) => new AppError(`${resource} not found`, StatusCodes.NOT_FOUND, ErrorCodes.NOT_FOUND),
  resourceNotFound: (resource, id) => new AppError(`${resource} with ID ${id} not found`, StatusCodes.NOT_FOUND, ErrorCodes.RESOURCE_NOT_FOUND),
};

export default { AppError, ErrorCodes, StatusCodes, errors };
