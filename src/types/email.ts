export interface EmailValidationResult {
  email: string;
  status: '✅ Valid – Safe to Contact' | '⚠️ Retry Later' | '❌ Do Not Contact';
  confidence: 'High' | 'Medium' | 'Low';
  reason?: string;
  timestamp: string;
  retryAfter?: number;
  details: {
    format: boolean;
    domain: boolean;
    disposable: boolean;
    mxRecords: boolean;
    smtp: boolean;
    spamTrap: boolean;
    corporate: boolean;
    blacklisted: boolean;
    retryCount: number;
    lastRetryTimestamp?: string;
    verificationSteps: string[];
  };
}

export interface ValidationProgress {
  processed: number;
  total: number;
  validCount: number;
  retryCount: number;
  invalidCount: number;
  avgProcessingTime: number;
}

export interface ValidationStats {
  totalEmails: number;
  validEmails: number;
  retryEmails: number;
  invalidEmails: number;
  processingTime: number;
  corporateEmailsCount: number;
  temporaryFailuresCount: number;
}

export interface RetryStrategy {
  maxAttempts: number;
  backoffDelay: number;
  timeout: number;
}

export interface ValidationOptions {
  enableRetries: boolean;
  retryStrategy: RetryStrategy;
  validateSMTP: boolean;
  strictMode: boolean;
}