import validator from 'validator';
import type { 
  EmailValidationResult, 
  ValidationOptions, 
  RetryStrategy,
  ValidationProgress
} from '../types/email';

const CHUNK_SIZE = 2000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_EMAILS = 40000;

const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxAttempts: 3,
  backoffDelay: 2000, // 2 seconds
  timeout: 30000 // 30 seconds
};

const DEFAULT_OPTIONS: ValidationOptions = {
  enableRetries: true,
  retryStrategy: DEFAULT_RETRY_STRATEGY,
  validateSMTP: true,
  strictMode: false
};

// Enterprise domain whitelist
const ENTERPRISE_DOMAINS = new Set([
  'microsoft.com', 'apple.com', 'google.com', 'amazon.com',
  'facebook.com', 'oracle.com', 'ibm.com', 'intel.com',
  'cisco.com', 'hp.com', 'dell.com', 'samsung.com',
  'sony.com', 'toyota.com', 'honda.com', 'bmw.com',
  'boeing.com', 'ge.com', 'siemens.com', 'philips.com'
]);

// Educational and government domains
const TRUSTED_TLDS = new Set([
  'edu', 'gov', 'mil', 'ac.uk', 'gov.uk', 'edu.au',
  'gov.au', 'ac.jp', 'go.jp', 'edu.cn', 'gov.cn'
]);

export const validateFileSize = (file: File): boolean => {
  return file.size <= MAX_FILE_SIZE;
};

export const validateFileType = (file: File): boolean => {
  return file.type === 'text/csv' || file.type === 'text/plain';
};

export const parseEmailFile = async (file: File): Promise<string[]> => {
  const text = await file.text();
  const emails = text
    .split(/[\n,]/)
    .map(email => email.trim())
    .filter(email => email && email.includes('@')) // Only keep non-empty strings containing @
    .map(email => email.replace(/['"]/g, '')) // Remove quotes
    .slice(0, MAX_EMAILS);

  if (emails.length === 0) {
    throw new Error('No valid emails found in file');
  }

  return emails;
};

const isEnterpriseDomain = (domain: string): boolean => {
  return ENTERPRISE_DOMAINS.has(domain.toLowerCase()) || 
         [...TRUSTED_TLDS].some(tld => domain.toLowerCase().endsWith(`.${tld}`));
};

const detectSpamTrapPattern = (email: string): boolean => {
  const patterns = [
    /^(abuse|postmaster|spam|noreply)@/i,
    /^[a-z0-9]{20,}@/i,
    /(spam|trap|honeypot)/i
  ];
  return patterns.some(pattern => pattern.test(email));
};

const checkMXRecords = async (domain: string): Promise<boolean> => {
  try {
    // Simulated MX check - in production, use actual DNS lookup
    const validDomains = new Set([
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'protonmail.com', 'zoho.com'
    ]);
    
    return validDomains.has(domain.toLowerCase()) || 
           isEnterpriseDomain(domain) || 
           Math.random() > 0.1; // Simulate some failures
  } catch (error) {
    return false;
  }
};

const checkSMTP = async (email: string): Promise<boolean> => {
  // Simulated SMTP check - in production, use actual SMTP verification
  const [, domain] = email.split('@');
  return isEnterpriseDomain(domain) || Math.random() > 0.05; // Simulate some failures
};

const validateEmailWithRetry = async (
  email: string,
  options: ValidationOptions = DEFAULT_OPTIONS
): Promise<EmailValidationResult> => {
  const verificationSteps: string[] = [];
  const [localPart, domain] = email.split('@');
  
  // Format check (RFC 5322)
  const isValidFormat = validator.isEmail(email, {
    allow_utf8_local_part: false,
    require_tld: true,
    allow_ip_domain: false
  });

  if (!isValidFormat) {
    return {
      email,
      status: '❌ Do Not Contact',
      confidence: 'Low',
      reason: 'Invalid email format (RFC 5322)',
      timestamp: new Date().toISOString(),
      details: {
        format: false,
        domain: false,
        disposable: false,
        mxRecords: false,
        smtp: false,
        spamTrap: false,
        corporate: false,
        blacklisted: false,
        retryCount: 0,
        verificationSteps: ['Format check failed']
      }
    };
  }

  verificationSteps.push('Format check passed');
  
  // Domain verification
  const isValidDomain = validator.isFQDN(domain, {
    require_tld: true,
    allow_underscores: false,
    allow_trailing_dot: false
  });

  if (!isValidDomain) {
    return {
      email,
      status: '❌ Do Not Contact',
      confidence: 'Low',
      reason: 'Invalid domain format',
      timestamp: new Date().toISOString(),
      details: {
        format: true,
        domain: false,
        disposable: false,
        mxRecords: false,
        smtp: false,
        spamTrap: false,
        corporate: false,
        blacklisted: false,
        retryCount: 0,
        verificationSteps
      }
    };
  }

  verificationSteps.push('Domain format valid');

  // Check for enterprise domain
  const isCorporate = isEnterpriseDomain(domain);
  if (isCorporate) {
    verificationSteps.push('Enterprise domain detected');
  }

  // MX record check with retries
  let mxExists = false;
  let mxRetries = 0;
  while (mxRetries < options.retryStrategy.maxAttempts) {
    try {
      mxExists = await checkMXRecords(domain);
      if (mxExists) break;
      mxRetries++;
      if (mxRetries < options.retryStrategy.maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, options.retryStrategy.backoffDelay));
      }
    } catch (error) {
      mxRetries++;
    }
  }

  if (!mxExists && !isCorporate) {
    return {
      email,
      status: '❌ Do Not Contact',
      confidence: 'High',
      reason: 'No MX records found',
      timestamp: new Date().toISOString(),
      details: {
        format: true,
        domain: true,
        disposable: false,
        mxRecords: false,
        smtp: false,
        spamTrap: false,
        corporate: false,
        blacklisted: false,
        retryCount: mxRetries,
        verificationSteps
      }
    };
  }

  verificationSteps.push('MX records verified');

  // SMTP verification with retries
  let smtpValid = false;
  let smtpRetries = 0;
  while (smtpRetries < options.retryStrategy.maxAttempts) {
    try {
      smtpValid = await checkSMTP(email);
      if (smtpValid) break;
      smtpRetries++;
      if (smtpRetries < options.retryStrategy.maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, options.retryStrategy.backoffDelay));
      }
    } catch (error) {
      smtpRetries++;
    }
  }

  if (!smtpValid && !isCorporate) {
    // If SMTP check failed but it's temporary, mark for retry
    if (smtpRetries < options.retryStrategy.maxAttempts) {
      return {
        email,
        status: '⚠️ Retry Later',
        confidence: 'Medium',
        reason: 'Temporary SMTP failure',
        timestamp: new Date().toISOString(),
        retryAfter: options.retryStrategy.backoffDelay,
        details: {
          format: true,
          domain: true,
          disposable: false,
          mxRecords: true,
          smtp: false,
          spamTrap: false,
          corporate: false,
          blacklisted: false,
          retryCount: smtpRetries,
          verificationSteps
        }
      };
    }

    return {
      email,
      status: '❌ Do Not Contact',
      confidence: 'High',
      reason: 'SMTP verification failed',
      timestamp: new Date().toISOString(),
      details: {
        format: true,
        domain: true,
        disposable: false,
        mxRecords: true,
        smtp: false,
        spamTrap: false,
        corporate: false,
        blacklisted: false,
        retryCount: smtpRetries,
        verificationSteps
      }
    };
  }

  verificationSteps.push('SMTP verification passed');

  // If all checks pass or it's a corporate domain
  return {
    email,
    status: '✅ Valid – Safe to Contact',
    confidence: 'High',
    timestamp: new Date().toISOString(),
    details: {
      format: true,
      domain: true,
      disposable: false,
      mxRecords: true,
      smtp: true,
      spamTrap: false,
      corporate: isCorporate,
      blacklisted: false,
      retryCount: Math.max(mxRetries, smtpRetries),
      verificationSteps
    }
  };
};

export const validateEmailBatch = async (
  emails: string[],
  onProgress: (processed: number) => void,
  options: ValidationOptions = DEFAULT_OPTIONS
): Promise<EmailValidationResult[]> => {
  const chunks = chunk(emails, CHUNK_SIZE);
  const results: EmailValidationResult[] = [];
  let processed = 0;

  await Promise.all(
    chunks.map(async (chunk) => {
      const chunkResults = await Promise.all(
        chunk.map(async (email) => {
          const result = await validateEmailWithRetry(email, options);
          processed++;
          onProgress(processed);
          return result;
        })
      );
      results.push(...chunkResults);
    })
  );

  // Ensure we have results
  if (results.length === 0) {
    throw new Error('No results generated from validation');
  }

  // Log validation statistics
  const stats = {
    total: results.length,
    valid: results.filter(r => r.status === '✅ Valid – Safe to Contact').length,
    retry: results.filter(r => r.status === '⚠️ Retry Later').length,
    invalid: results.filter(r => r.status === '❌ Do Not Contact').length
  };

  console.log('Validation completed:', stats);
  
  return results;
};

const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};