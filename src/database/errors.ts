/**
 * Custom Database Error Classes
 * 
 * Provides specific error types for different Prisma error codes
 * to enable better error handling throughout the application.
 */

import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
} from '@prisma/client/runtime/library';

/**
 * Base class for all database errors
 */
export class DatabaseError extends Error {
  public readonly code: string;
  public readonly originalError?: Error;

  constructor(message: string, code: string, originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.originalError = originalError;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a unique constraint is violated (P2002)
 */
export class DuplicateEntryError extends DatabaseError {
  public readonly field?: string;

  constructor(message: string, field?: string, originalError?: Error) {
    super(message, 'P2002', originalError);
    this.name = 'DuplicateEntryError';
    this.field = field;
  }
}

/**
 * Error thrown when a record is not found (P2025)
 */
export class NotFoundError extends DatabaseError {
  public readonly model?: string;

  constructor(message: string, model?: string, originalError?: Error) {
    super(message, 'P2025', originalError);
    this.name = 'NotFoundError';
    this.model = model;
  }
}

/**
 * Error thrown when database connection fails
 */
export class DatabaseConnectionError extends DatabaseError {
  public readonly retryable: boolean;

  constructor(message: string, retryable = true, originalError?: Error) {
    super(message, 'CONNECTION_ERROR', originalError);
    this.name = 'DatabaseConnectionError';
    this.retryable = retryable;
  }
}

/**
 * Error thrown when a foreign key constraint fails (P2003)
 */
export class ForeignKeyConstraintError extends DatabaseError {
  public readonly fieldName?: string;

  constructor(message: string, fieldName?: string, originalError?: Error) {
    super(message, 'P2003', originalError);
    this.name = 'ForeignKeyConstraintError';
    this.fieldName = fieldName;
  }
}

/**
 * Error thrown when a required field is missing (P2011, P2012)
 */
export class ValidationError extends DatabaseError {
  public readonly field?: string;

  constructor(message: string, field?: string, originalError?: Error) {
    super(message, 'VALIDATION_ERROR', originalError);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Wraps Prisma errors into specific error types
 * @param error - The original Prisma error
 * @throws {DuplicateEntryError|NotFoundError|DatabaseConnectionError|DatabaseError}
 */
export function handlePrismaError(error: unknown): never {
  // Check if it's a Prisma error
  if (error instanceof PrismaClientKnownRequestError) {
    const prismaError = error as PrismaClientKnownRequestError;
    
    switch (prismaError.code) {
      case 'P2002': {
        // Unique constraint failed
        const field = (prismaError.meta?.target as string[])?.[0];
        throw new DuplicateEntryError(
          `Duplicate entry found for field: ${field || 'unknown'}`,
          field,
          prismaError
        );
      }
      
      case 'P2025': {
        // Record not found
        const model = (prismaError.meta?.modelName as string) || 'Record';
        throw new NotFoundError(
          `${model} not found`,
          model,
          prismaError
        );
      }
      
      case 'P2003': {
        // Foreign key constraint failed
        const fieldName = prismaError.meta?.field_name as string;
        throw new ForeignKeyConstraintError(
          `Foreign key constraint failed on field: ${fieldName || 'unknown'}`,
          fieldName,
          prismaError
        );
      }
      
      case 'P2011':
      case 'P2012': {
        // Null constraint violation
        const path = (prismaError.meta?.path as string) || 'field';
        throw new ValidationError(
          `Required field is null or missing: ${path}`,
          path,
          prismaError
        );
      }
      
      case 'P1001': {
        // Can't reach database server
        throw new DatabaseConnectionError(
          'Unable to connect to the database server. Please check your connection.',
          true,
          prismaError
        );
      }
      
      case 'P1002': {
        // Database server timeout
        throw new DatabaseConnectionError(
          'Database server connection timed out.',
          true,
          prismaError
        );
      }
      
      case 'P1008': {
        // Operations timed out
        throw new DatabaseConnectionError(
          'Database operation timed out.',
          false,
          prismaError
        );
      }
      
      default: {
        // Unknown Prisma error
        throw new DatabaseError(
          `Database error occurred: ${prismaError.message}`,
          prismaError.code,
          prismaError
        );
      }
    }
  }
  
  // Handle Prisma validation errors
  if (error instanceof PrismaClientValidationError) {
    throw new ValidationError(
      'Invalid data provided for database operation',
      undefined,
      error
    );
  }
  
  // Handle connection initialization errors
  if (error instanceof PrismaClientInitializationError) {
    throw new DatabaseConnectionError(
      'Failed to initialize database client',
      true,
      error
    );
  }
  
  // Handle unknown errors
  if (error instanceof Error) {
    throw new DatabaseError(
      `Unexpected database error: ${error.message}`,
      'UNKNOWN_ERROR',
      error
    );
  }
  
  // Handle non-Error objects
  throw new DatabaseError(
    'An unknown error occurred during database operation',
    'UNKNOWN_ERROR',
    error instanceof Error ? error : undefined
  );
}

/**
 * Wraps an async function with Prisma error handling
 * @param fn - The async function to wrap
 * @returns A function that handles Prisma errors
 */
export function withErrorHandling<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      handlePrismaError(error);
    }
  };
}
