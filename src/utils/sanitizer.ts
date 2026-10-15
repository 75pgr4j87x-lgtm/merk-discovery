/**
 * Merakifos Compliance & Security Sanitizer
 * OWASP Top 10 Compliant: Defenses against XSS (A03), Injection (A03), and CSV/Formula Injection
 */

/**
 * Escapes characters that have special meaning in HTML contexts to prevent Cross-Site Scripting (XSS).
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitizes plain text input by stripping executable tags, scripting attributes, and malicious protocol schemes.
 */
export function sanitizePlainText(input: unknown, maxLength: number = 2000): string {
  if (input === null || input === undefined) return '';
  let str = String(input);

  // Strip script tags, iframe tags, object tags, and embeds
  str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  str = str.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  str = str.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  str = str.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');

  // Strip dangerous inline event handlers like onerror=, onclick=, onload=
  str = str.replace(/on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // Strip javascript: and data: URI schemes in text
  str = str.replace(/javascript\s*:/gi, '');
  str = str.replace(/data\s*:\s*text\/html/gi, '');

  // Normalize Unicode and control characters (except newline, tab)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Truncate to maximum permissible length
  if (str.length > maxLength) {
    str = str.slice(0, maxLength);
  }

  return str.trim();
}

/**
 * Validates and sanitizes email addresses according to RFC 5322 compliance.
 */
export function sanitizeEmail(email: unknown): { isValid: boolean; email: string } {
  if (!email || typeof email !== 'string') {
    return { isValid: false, email: '' };
  }
  const trimmed = email.trim().toLowerCase().slice(0, 254);
  // Robust RFC 5322 standard email pattern
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  const isValid = emailRegex.test(trimmed);
  return { isValid, email: trimmed };
}

/**
 * OWASP CSV / Formula Injection Prevention.
 * Spreadsheet software (Microsoft Excel, Google Sheets, Apple Numbers) will execute formulas
 * if a cell begins with '=', '+', '-', '@', '\t', '\r', or '|'.
 * This function prefixes any vulnerable string with a single quote (') to force text evaluation.
 */
export function sanitizeSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Strip carriage returns and control characters
  str = str.replace(/[\r\n\t]/g, ' ').trim();

  // If the cell begins with a formula trigger character, prepend a single quote
  if (/^[=\+\-@\|\t\r]/.test(str)) {
    return `'${str}`;
  }

  return str;
}

/**
 * Comprehensive submission payload validation and sanitization
 */
export function sanitizeSubmissionPayload(body: any) {
  const errors: string[] = [];

  const answers = body?.answers || {};
  const brief = sanitizePlainText(body?.brief || '', 15000);
  const approved = Boolean(body?.approved);
  const id = body?.id ? sanitizePlainText(body.id, 64) : undefined;

  const clientName = sanitizePlainText(answers.clientName || '', 100);
  const companyName = sanitizePlainText(answers.companyName || '', 150);
  const { isValid: isEmailValid, email: clientEmail } = sanitizeEmail(answers.clientEmail || '');

  if (!clientName && !companyName && !clientEmail && !brief) {
    errors.push('Submission payload is empty or invalid.');
  }

  const sanitizedAnswers = {
    ...answers,
    clientName,
    companyName,
    clientEmail: isEmailValid ? clientEmail : sanitizePlainText(answers.clientEmail || '', 150),
    businessAndClient: sanitizePlainText(answers.businessAndClient || answers.businessSummary || '', 3000),
    businessSummary: sanitizePlainText(answers.businessSummary || answers.businessAndClient || '', 3000),
    primaryGoal: sanitizePlainText(answers.primaryGoal || '', 200),
    targetAudience: sanitizePlainText(answers.targetAudience || '', 200),
    corePainPoint: sanitizePlainText(answers.corePainPoint || '', 2000),
    aestheticVibe: sanitizePlainText(answers.aestheticVibe || '', 200),
    visualColors: sanitizePlainText(answers.visualColors || '', 1000),
    inspirationSites: sanitizePlainText(answers.inspirationSites || '', 1000),
    successOutcome: sanitizePlainText(answers.successOutcome || '', 2000),
    timelineSelection: sanitizePlainText(answers.timelineSelection || '', 200),
    customTimeline: sanitizePlainText(answers.customTimeline || '', 500),
    budgetSelection: sanitizePlainText(answers.budgetSelection || '', 200),
    customBudget: sanitizePlainText(answers.customBudget || '', 500),
    domainName: sanitizePlainText(answers.domainName || '', 255),
    selectedColors: Array.isArray(answers.selectedColors)
      ? answers.selectedColors.slice(0, 10).map((c: any) => sanitizePlainText(c, 50))
      : [],
    brandVibe: Array.isArray(answers.brandVibe)
      ? answers.brandVibe.slice(0, 10).map((v: any) => sanitizePlainText(v, 100))
      : [],
    existingAssets: Array.isArray(answers.existingAssets)
      ? answers.existingAssets.slice(0, 10).map((a: any) => sanitizePlainText(a, 150))
      : [],
    coreObjectives: Array.isArray(answers.coreObjectives)
      ? answers.coreObjectives.slice(0, 10).map((o: any) => sanitizePlainText(o, 200))
      : [],
    selectedFeatures: Array.isArray(answers.selectedFeatures)
      ? answers.selectedFeatures.slice(0, 15).map((f: any) => sanitizePlainText(f, 200))
      : [],
  };

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      id,
      answers: sanitizedAnswers,
      brief,
      approved,
    },
  };
}
