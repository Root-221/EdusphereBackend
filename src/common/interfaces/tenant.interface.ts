import { SchoolStatus } from '@prisma/client';

export interface ITenant {
  id: string;
  slug: string;
  name: string;
  status: SchoolStatus;
  plan: string;
  databaseUrl: string;
}
