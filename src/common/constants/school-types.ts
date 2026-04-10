export const SCHOOL_TYPES = [
  'PUBLIC',
  'PRIVATE',
  'COLLEGE',
  'LYCEE',
  'UNIVERSITY',
  'INSTITUTE',
  'CORANIC',
] as const;

export type SchoolType = (typeof SCHOOL_TYPES)[number];
