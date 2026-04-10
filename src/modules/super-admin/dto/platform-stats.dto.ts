import { SchoolStatus } from '@prisma/client';
import { SchoolType } from '@common/constants/school-types';

export type NormalizedSchoolStatus = Lowercase<SchoolStatus>;
export type NormalizedSchoolType =
  | Lowercase<SchoolType>
  | 'institute'
  | 'coranic';

export interface PlatformSchoolSummary {
  id: string;
  name: string;
  status: NormalizedSchoolStatus;
  type: NormalizedSchoolType;
  plan: string;
  email: string;
  slug: string;
  createdAt: string;
}

export interface PlatformActivity {
  id: string;
  action: string;
  school?: string;
  user?: string;
  time: string;
}

export interface PlatformStatsDto {
  totalSchools: number;
  activeSchools: number;
  suspendedSchools: number;
  pendingSchools: number;
  totalStudents: number;
  totalTeachers: number;
  totalAdmins: number;
  totalUsers: number;
  monthlyRevenue: number;
  schoolsByType: Record<NormalizedSchoolType, number>;
  schoolsByPlan: Record<'free' | 'basic' | 'premium' | 'enterprise', number>;
  recentSchools: PlatformSchoolSummary[];
  recentActivity: PlatformActivity[];
}
