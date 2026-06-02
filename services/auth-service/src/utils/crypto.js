import argon2 from 'argon2';
import { config } from '../config/index.js';

/**
 * Hash a password using Argon2id (recommended variant)
 */
export const hashPassword = async (password) => {
  try {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: config.argon2.memoryCost,
      timeCost: config.argon2.timeCost,
      parallelism: config.argon2.parallelism,
      hashLength: config.argon2.hashLength,
    });
    return hash;
  } catch (error) {
    throw new Error('Failed to hash password');
  }
};

/**
 * Verify a password against a hash
 */
export const verifyPassword = async (password, hash) => {
  try {
    const match = await argon2.verify(hash, password);
    return match;
  } catch (error) {
    throw new Error('Failed to verify password');
  }
};

/**
 * Check if a hash needs rehashing (for algorithm upgrades)
 */
export const needsRehash = async (hash) => {
  try {
    return argon2.verify(hash, 'test-password-will-fail-but-check-params').catch(() => {
      // If verification fails, we can still check if params are outdated
      const params = argon2.getInfo(hash);
      if (!params) return true;
      
      return (
        params.memory !== config.argon2.memoryCost ||
        params.time !== config.argon2.timeCost ||
        params.parallelism !== config.argon2.parallelism ||
        params.hashLength !== config.argon2.hashLength
      );
    });
  } catch (error) {
    return true; // Rehash on error to be safe
  }
};

/**
 * Generate a secure random string for tokens, OTPs, etc.
 */
export const generateSecureRandom = (length = 32) => {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Sanitize user input to prevent injection attacks
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') {
    return input;
  }
  
  // Remove potential XSS characters
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
};

/**
 * Validate email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format (international)
 */
export const isValidPhone = (phone) => {
  // E.164 format: +[country code][number]
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
};

/**
 * Validate password strength
 * Returns an object with validity and requirements met
 */
export const validatePasswordStrength = (password) => {
  const requirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
  
  const metCount = Object.values(requirements).filter(Boolean).length;
  const strength = metCount === 5 ? 'strong' : metCount >= 3 ? 'medium' : 'weak';
  
  return {
    isValid: metCount >= 4 && password.length >= 8,
    strength,
    requirements,
    message: getPasswordStrengthMessage(strength),
  };
};

/**
 * Get password strength message
 */
const getPasswordStrengthMessage = (strength) => {
  switch (strength) {
    case 'strong':
      return 'Password strength is strong';
    case 'medium':
      return 'Password strength is medium. Consider adding more character types.';
    case 'weak':
      return 'Password strength is weak. Use at least 8 characters with uppercase, lowercase, numbers, and special characters.';
    default:
      return '';
  }
};

/**
 * Mask sensitive data for logging
 */
export const maskSensitiveData = (data, visibleChars = 4) => {
  if (!data || typeof data !== 'string') {
    return data;
  }
  
  if (data.length <= visibleChars) {
    return '*'.repeat(data.length);
  }
  
  const visiblePart = data.slice(-visibleChars);
  const maskedPart = '*'.repeat(data.length - visibleChars);
  return `${maskedPart}${visiblePart}`;
};

/**
 * Mask email (show first char and domain)
 */
export const maskEmail = (email) => {
  if (!email || !email.includes('@')) {
    return email;
  }
  
  const [local, domain] = email.split('@');
  const maskedLocal = local.charAt(0) + '*'.repeat(local.length - 1);
  return `${maskedLocal}@${domain}`;
};

/**
 * Mask phone number (show last 4 digits)
 */
export const maskPhone = (phone) => {
  if (!phone || phone.length < 4) {
    return '*'.repeat(phone?.length || 0);
  }
  
  return '*'.repeat(phone.length - 4) + phone.slice(-4);
};

export default {
  hashPassword,
  verifyPassword,
  needsRehash,
  generateSecureRandom,
  sanitizeInput,
  isValidEmail,
  isValidPhone,
  validatePasswordStrength,
  maskSensitiveData,
  maskEmail,
  maskPhone,
};
