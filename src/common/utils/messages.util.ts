import { ErrorCode } from '../enums/error-codes.enum';
import { SuccessMessage } from '../enums/success-messages.enum';
import { ErrorMessages } from '../i18n/error-messages';
import { SuccessMessages } from '../i18n/success-messages';

export type Locale = 'fr' | 'en';

export function getErrorMessage(code: ErrorCode, locale: Locale = 'fr'): string {
  return ErrorMessages[code]?.[locale] || ErrorMessages[ErrorCode.INTERNAL_ERROR][locale];
}

export function getSuccessMessage(code: SuccessMessage, locale: Locale = 'fr'): string {
  return SuccessMessages[code]?.[locale] || SuccessMessages[SuccessMessage.OPERATION_SUCCESS][locale];
}

// Utilitaire pour exceptions formatées
export function createErrorResponse(code: ErrorCode, details?: string[], locale: Locale = 'fr') {
  return {
    code,
    message: getErrorMessage(code, locale),
    ...(details && details.length > 0 && { details }),
  };
}

