import { randomBytes } from 'node:crypto';

export function deriveAcademicYearSuffix(academicYearName?: string | null): string {
  if (!academicYearName) {
    return new Date().getFullYear().toString();
  }

  const normalized = academicYearName.trim();
  const rangeMatch = normalized.match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  if (rangeMatch) {
    return rangeMatch[2];
  }

  const yearMatch = normalized.match(/(\d{4})$/);
  if (yearMatch) {
    return yearMatch[1];
  }

  return new Date().getFullYear().toString();
}

export function formatSequenceCode(
  prefix: string,
  academicYearSuffix: string,
  sequence: number,
  width = 4,
): string {
  return `${prefix}-${academicYearSuffix}-${String(sequence).padStart(width, '0')}`;
}

export function generateTemporaryPassword(length = 12): string {
  const bytes = randomBytes(length);
  return bytes
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, length);
}

export function buildStudentQrCode(slug: string, matricule: string): string {
  return `EDUSPHERE|${slug.toUpperCase()}|${matricule}`;
}
