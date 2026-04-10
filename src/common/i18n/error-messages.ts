import { ErrorCode } from '../enums/error-codes.enum';

export const ErrorMessages: Record<ErrorCode, Record<'fr' | 'en', string>> = {
  [ErrorCode.INTERNAL_ERROR]: {
    fr: 'Une erreur interne est survenue',
    en: 'An internal error occurred'
  },
  [ErrorCode.NOT_FOUND]: {
    fr: 'Ressource non trouvée',
    en: 'Resource not found'
  },
  [ErrorCode.BAD_REQUEST]: {
    fr: 'Mauvaise requête',
    en: 'Bad request'
  },
  [ErrorCode.UNAUTHORIZED]: {
    fr: 'Non autorisé',
    en: 'Unauthorized'
  },
  [ErrorCode.FORBIDDEN]: {
    fr: 'Accès interdit',
    en: 'Forbidden'
  },
  [ErrorCode.CONFLICT]: {
    fr: 'Conflit de ressources',
    en: 'Conflict'
  },
  [ErrorCode.VALIDATION_ERROR]: {
    fr: 'Erreur de validation',
    en: 'Validation error'
  },
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: {
    fr: 'Email ou mot de passe incorrect',
    en: 'Invalid email or password'
  },
  [ErrorCode.AUTH_ACCOUNT_INACTIVE]: {
    fr: 'Votre compte est désactivé',
    en: 'Your account is inactive'
  },
  [ErrorCode.AUTH_INVALID_REFRESH_TOKEN]: {
    fr: 'Token de rafraîchissement invalide ou expiré',
    en: 'Invalid or expired refresh token'
  },
  [ErrorCode.AUTH_USER_NOT_FOUND]: {
    fr: 'Utilisateur non trouvé',
    en: 'User not found'
  },
  [ErrorCode.SCHOOL_SLUG_EXISTS]: {
    fr: `Ce slug d'ecole existe déjà`,
    en: 'School slug already exists'
  },
  [ErrorCode.SCHOOL_EMAIL_EXISTS]: {
    fr: "L'adresse e-mail de cette école existe déjà",
    en: 'This school email already exists',
  },
  [ErrorCode.TENANT_NOT_FOUND]: {
    fr: 'Aucune école trouvée pour ce sous-domaine',
    en: 'No school found for this subdomain'
  },
  [ErrorCode.TENANT_SUSPENDED]: {
    fr: 'Cette école est suspendue ou en attente de validation',
    en: 'This school is suspended or pending validation'
  },
  [ErrorCode.THROTTLE_EXCEEDED]: {
    fr: 'Trop de requêtes. Réessayez dans un moment.',
    en: 'Too many requests. Try again later.'
  },
};
