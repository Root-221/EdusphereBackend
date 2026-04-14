export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
    role: string;
    schoolId: string | null;
    schoolName: string | null;
    schoolSlug: string | null;
    mustChangePassword: boolean;
  };
}
