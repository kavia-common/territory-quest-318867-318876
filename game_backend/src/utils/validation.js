import Joi from 'joi';
import logger from './logger.js';

// PUBLIC_INTERFACE
/**
 * Standard response formatter for success responses
 * @param {object} data - Response data
 * @param {string} message - Optional success message
 * @returns {object} - Formatted success response
 */
export const successResponse = (data, message = null) => {
  const response = {
    success: true,
    data
  };
  
  if (message) {
    response.message = message;
  }
  
  return response;
};

// PUBLIC_INTERFACE
/**
 * Standard response formatter for error responses
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {array} errors - Optional validation errors
 * @returns {object} - Formatted error response
 */
export const errorResponse = (message, statusCode = 500, errors = null) => {
  const response = {
    success: false,
    error: {
      message,
      statusCode
    }
  };
  
  if (errors) {
    response.error.errors = errors;
  }
  
  return response;
};

// PUBLIC_INTERFACE
/**
 * Middleware factory for Joi validation
 * @param {object} schema - Joi schema object with body, query, params keys
 * @returns {function} - Express middleware function
 */
export const validate = (schema) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false, // Return all errors
      allowUnknown: true, // Allow unknown keys that will be ignored
      stripUnknown: true // Remove unknown keys
    };
    
    const toValidate = {};
    
    if (schema.body) toValidate.body = req.body;
    if (schema.query) toValidate.query = req.query;
    if (schema.params) toValidate.params = req.params;
    
    const schemaToValidate = Joi.object(schema);
    const { error, value } = schemaToValidate.validate(toValidate, validationOptions);
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      logger.warn('Validation failed', {
        url: req.url,
        method: req.method,
        errors
      });
      
      return res.status(400).json(errorResponse('Validation failed', 400, errors));
    }
    
    // Replace request data with validated data
    if (value.body) req.body = value.body;
    if (value.query) req.query = value.query;
    if (value.params) req.params = value.params;
    
    next();
  };
};

// ============================================
// COMMON VALIDATION SCHEMAS
// ============================================

// Coordinate validation
export const coordinateSchema = {
  lat: Joi.number().min(-90).max(90).required().messages({
    'number.base': 'Latitude must be a number',
    'number.min': 'Latitude must be between -90 and 90',
    'number.max': 'Latitude must be between -90 and 90',
    'any.required': 'Latitude is required'
  }),
  lon: Joi.number().min(-180).max(180).required().messages({
    'number.base': 'Longitude must be a number',
    'number.min': 'Longitude must be between -180 and 180',
    'number.max': 'Longitude must be between -180 and 180',
    'any.required': 'Longitude is required'
  })
};

// UUID validation
export const uuidSchema = Joi.string().uuid().messages({
  'string.guid': 'Invalid UUID format'
});

// Pagination validation
export const paginationSchema = {
  limit: Joi.number().integer().min(1).max(1000).default(100).messages({
    'number.base': 'Limit must be a number',
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit must not exceed 1000'
  }),
  offset: Joi.number().integer().min(0).default(0).messages({
    'number.base': 'Offset must be a number',
    'number.min': 'Offset must be at least 0'
  })
};

// Zone ID validation
export const zoneIdSchema = Joi.string().pattern(/^-?\d+_-?\d+$/).messages({
  'string.pattern.base': 'Invalid zone ID format'
});

export default {
  validate,
  successResponse,
  errorResponse,
  coordinateSchema,
  uuidSchema,
  paginationSchema,
  zoneIdSchema
};
