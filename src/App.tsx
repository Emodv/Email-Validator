import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  AlertCircle,
  FileText,
  Info
} from 'lucide-react';
import {
  validateFileSize,
  validateFileType,
  parseEmailFile,
  validateEmailBatch
} from './utils/emailValidator';
import type { EmailValidationResult, ValidationProgress, ValidationStats } from './types/email';

function App() {
  const [results, setResults] = useState<EmailValidationResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ValidationProgress>({
    processed: 0,
    total: 0,
    validCount: 0,
    retryCount: 0,
    invalidCount: 0,
    avgProcessingTime: 0
  });
  const [stats, setStats] = useState<ValidationStats | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!validateFileSize(file)) {
      setError('File size exceeds 10MB limit');
      return;
    }

    if (!validateFileType(file)) {
      setError('Only CSV and TXT files are supported');
      return;
    }

    try {
      setProcessing(true);
      setError(null);
      setResults([]);

      const emails = await parseEmailFile(file);
      const startTime = Date.now();

      setProgress({
        processed: 0,
        total: emails.length,
        validCount: 0,
        retryCount: 0,
        invalidCount: 0,
        avgProcessingTime: 0
      });

      const validationResults = await validateEmailBatch(emails, (processed) => {
        setProgress(prev => ({
          ...prev,
          processed,
          validCount: results.filter(r => r.status === '✅ Valid – Safe to Contact').length,
          retryCount: results.filter(r => r.status === '⚠️ Retry Later').length,
          invalidCount: results.filter(r => r.status === '❌ Do Not Contact').length,
          avgProcessingTime: (Date.now() - startTime) / processed
        }));
      });

      setResults(validationResults);
      setStats({
        totalEmails: emails.length,
        validEmails: validationResults.filter(r => r.status === '✅ Valid – Safe to Contact').length,
        retryEmails: validationResults.filter(r => r.status === '⚠️ Retry Later').length,
        invalidEmails: validationResults.filter(r => r.status === '❌ Do Not Contact').length,
        processingTime: Date.now() - startTime,
        corporateEmailsCount: validationResults.filter(r => r.details.corporate).length,
        temporaryFailuresCount: validationResults.filter(r => r.reason?.includes('temporary')).length
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error processing file');
    } finally {
      setProcessing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    disabled: processing
  });

  const handleDownload = useCallback((format: 'csv' | 'json') => {
    let content: string;
    let type: string;
    let extension: string;

    if (format === 'csv') {
      content = [
        ['Email', 'Status', 'Confidence', 'Reason', 'Verification Steps'].join(','),
        ...results.map(result => [
          result.email,
          result.status,
          result.confidence,
          result.reason || '',
          result.details.verificationSteps.join('; ')
        ].join(','))
      ].join('\n');
      type = 'text/csv';
      extension = 'csv';
    } else {
      content = JSON.stringify(results, null, 2);
      type = 'application/json';
      extension = 'json';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email_validation_results.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [results]);

  const copyValidEmails = useCallback(() => {
    const validEmails = results
      .filter(r => r.status === '✅ Valid – Safe to Contact')
      .map(r => r.email)
      .join('\n');
    navigator.clipboard.writeText(validEmails);
  }, [results]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Enterprise Email Validator
          </h1>
          <p className="text-gray-600">
            Validate up to 40,000 emails with enterprise-grade accuracy
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div {...getRootProps()} className="cursor-pointer">
            <input {...getInputProps()} />
            <div className={`border-2 border-dashed rounded-lg p-8 text-center ${
              isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}>
              <div className="flex justify-center mb-4">
                <Upload className="w-12 h-12 text-blue-500" />
              </div>
              <p className="text-gray-600 mb-2">
                Drag & drop your CSV/TXT file here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Maximum 40,000 emails (10MB limit)
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {processing && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="mb-2 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                <span className="text-gray-700">
                  Processing emails... ({progress.processed} of {progress.total})
                </span>
              </div>
              <span className="text-sm text-gray-500">
                {Math.round((progress.processed / progress.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.processed / progress.total) * 100}%`
                }}
              />
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Results</h2>
              <div className="flex gap-2">
                <button
                  onClick={copyValidEmails}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Copy Valid Emails
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownload('csv')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    CSV
                  </button>
                  <button
                    onClick={() => handleDownload('json')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    JSON
                  </button>
                </div>
              </div>
            </div>

            {stats && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-500">Total Processed</div>
                  <div className="text-xl font-semibold">{stats.totalEmails}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-green-600">Valid Emails</div>
                  <div className="text-xl font-semibold text-green-700">
                    {stats.validEmails}
                  </div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-sm text-yellow-600">Retry Later</div>
                  <div className="text-xl font-semibold text-yellow-700">
                    {stats.retryEmails}
                  </div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm text-red-600">Do Not Contact</div>
                  <div className="text-xl font-semibold text-red-700">
                    {stats.invalidEmails}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-green-700 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Valid – Safe to Contact
                </h3>
                <div className="max-h-96 overflow-y-auto">
                  {results
                    .filter(r => r.status === '✅ Valid – Safe to Contact')
                    .map((result, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 hover:bg-gray-50 group relative"
                      >
                        <CheckCircle className="w-4 h-4 text-green-500 mt-1" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span>{result.email}</span>
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                              {result.confidence}
                            </span>
                          </div>
                          <div className="hidden group-hover:block text-xs text-gray-500 mt-1">
                            {result.details.verificationSteps.map((step, i) => (
                              <div key={i}>{step}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-yellow-700 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Retry Later
                </h3>
                <div className="max-h-96 overflow-y-auto">
                  {results
                    .filter(r => r.status === '⚠️ Retry Later')
                    .map((result, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 hover:bg-gray-50 group relative"
                      >
                        <AlertTriangle className="w-4 h-4 text-yellow-500 mt-1" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span>{result.email}</span>
                            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                              Retry in {Math.ceil((result.retryAfter || 0) / 1000)}s
                            </span>
                          </div>
                          <div className="text-sm text-yellow-600">
                            {result.reason}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-red-700 mb-4 flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  Do Not Contact
                </h3>
                <div className="max-h-96 overflow-y-auto">
                  {results
                    .filter(r => r.status === '❌ Do Not Contact')
                    .map((result, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 hover:bg-gray-50 group relative"
                      >
                        <XCircle className="w-4 h-4 text-red-500 mt-1" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span>{result.email}</span>
                            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                              {result.confidence}
                            </span>
                          </div>
                          <div className="text-sm text-red-600">
                            {result.reason}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;