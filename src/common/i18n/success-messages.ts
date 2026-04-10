import { SuccessMessage } from '../enums/success-messages.enum';

export const SuccessMessages: Record<SuccessMessage, Record<'fr' | 'en', string>> = {
  [SuccessMessage.LOGIN_SUCCESS]: {
    fr: 'Connexion réussie',
    en: 'Login successful'
  },
  [SuccessMessage.REGISTER_SUCCESS]: {
    fr: 'École créée avec succès',
    en: 'School created successfully'
  },
  [SuccessMessage.REFRESH_SUCCESS]: {
    fr: 'Tokens rafraîchis',
    en: 'Tokens refreshed'
  },
  [SuccessMessage.LOGOUT_SUCCESS]: {
    fr: 'Déconnexion réussie',
    en: 'Logout successful'
  },
  [SuccessMessage.PROFILE_FETCHED]: {
    fr: 'Profil récupéré',
    en: 'Profile fetched'
  },
  [SuccessMessage.OPERATION_SUCCESS]: {
    fr: 'Opération réussie',
    en: 'Operation successful'
  },
};
