import { Prisma, PrismaClient, UserRole, SchoolType, SchoolStatus } from '@prisma/client';
import { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import * as bcrypt from 'bcrypt';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const prisma = new PrismaClient();

const TEMP_PASSWORD = process.env.TENANT_ADMIN_TEMP_PASSWORD ?? 'Password123!';
const TENANT_SCHEMA_PATH = path.resolve(process.cwd(), 'prisma/tenant/schema.prisma');

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildDatabaseName(slug: string): string {
  const template = process.env.TENANT_DB_NAME_TEMPLATE ?? 'edusphere_%s';
  if (template.includes('%s')) {
    return template.replace(/%s/g, slug);
  }
  return `${template}_${slug}`;
}

function buildDatabaseUrl(dbName: string, slug: string): string {
  const template = process.env.TENANT_DB_URL_TEMPLATE?.trim();
  if (template) {
    return template.replace(/%s/g, dbName).replace(/{{slug}}/g, slug);
  }

  const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error('DATABASE_ADMIN_URL or DATABASE_URL must be set');
  }

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function ensureDatabase(dbName: string, adminUrl: string) {
  const adminClient = new PrismaClient({
    datasources: {
      db: {
        url: adminUrl,
      },
    },
  });

  try {
    await adminClient.$connect();
    const rows = await adminClient.$queryRaw<{ datname: string }[]>(
      Prisma.sql`SELECT datname FROM pg_database WHERE datname = ${dbName}`,
    );
    if (!rows.length) {
      await adminClient.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await adminClient.$disconnect();
  }
}

async function pushTenantSchema(databaseUrl: string) {
  const result = spawnSync(
    'npx',
    ['prisma', 'db', 'push', '--schema', TENANT_SCHEMA_PATH, '--accept-data-loss'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    throw result.error ?? new Error(`Tenant schema push failed with status ${result.status ?? 'unknown'}`);
  }
}

async function clearTenantData(client: any) {
  await client.$transaction([
    client.timetableEntry.deleteMany(),
    client.timetable.deleteMany(),
    client.classSubject.deleteMany(),
    client.teacherSubject.deleteMany(),
    client.studentProfile.deleteMany(),
    client.parentProfile.deleteMany(),
    client.teacherProfile.deleteMany(),
    client.staffMember.deleteMany(),
    client.level.deleteMany(),
    client.schoolClass.deleteMany(),
    client.semester.deleteMany(),
    client.academicYear.deleteMany(),
    client.subject.deleteMany(),
    client.timeSlot.deleteMany(),
    client.session.deleteMany(),
    client.user.deleteMany(),
  ]);
}

async function main() {
  console.log('Seeding database...');
  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);

  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.school.deleteMany();

  await prisma.user.create({
    data: {
      email: 'superadmin@edusphere.sn',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      emailVerified: true,
    },
  });

  const schoolSlug = 'lycee-excellence';
  const normalizedSlug = normalizeSlug(schoolSlug);
  const databaseName = buildDatabaseName(normalizedSlug);
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error('DATABASE_ADMIN_URL or DATABASE_URL must be defined');
  }

  const databaseUrl = buildDatabaseUrl(databaseName, normalizedSlug);

  const school = await prisma.school.create({
    data: {
      name: 'Lycée Excellence',
      slug: schoolSlug,
      type: SchoolType.LYCEE,
      status: SchoolStatus.ACTIVE,
      plan: 'free',
      email: 'contact@lycee-excellence.sn',
      databaseUrl,
      city: 'Dakar',
      country: 'Sénégal',
      address: 'Plateau, Dakar',
      description: 'École de démonstration pour EduSphere',
    },
  });
  const schoolId = school.id;

  await ensureDatabase(databaseName, adminUrl);
  await pushTenantSchema(databaseUrl);

  const tenant = new TenantPrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await tenant.$connect();
    await clearTenantData(tenant);

    const schoolAdminEmail = 'admin@lycee-excellence.sn';
    await tenant.user.create({
      data: {
        email: schoolAdminEmail,
        passwordHash,
        firstName: 'Awa',
        lastName: 'Sow',
        role: UserRole.SCHOOL_ADMIN,
        phone: '+221 77 000 00 00',
        isActive: true,
        emailVerified: true,
      },
    });

    const activeYear = await tenant.academicYear.create({
      data: {
        schoolId,
        name: '2025-2026',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2026-07-15'),
        status: 'active',
      },
    });

    const previousYear = await tenant.academicYear.create({
      data: {
        schoolId,
        name: '2024-2025',
        startDate: new Date('2024-09-01'),
        endDate: new Date('2025-07-15'),
        status: 'completed',
      },
    });

    const semester1 = await tenant.semester.create({
      data: {
        schoolId,
        academicYearId: activeYear.id,
        name: 'Semestre 1',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2025-12-20'),
        status: 'completed',
        average: 12.5,
      },
    });

    const semester2 = await tenant.semester.create({
      data: {
        schoolId,
        academicYearId: activeYear.id,
        name: 'Semestre 2',
        startDate: new Date('2026-01-05'),
        endDate: new Date('2026-07-15'),
        status: 'active',
        average: null,
      },
    });

    const math = await tenant.subject.create({
      data: {
        schoolId,
        code: 'MAT',
        name: 'Mathématiques',
        coefficient: 4,
        hoursPerWeek: 6,
        status: 'active',
      },
    });

    const french = await tenant.subject.create({
      data: {
        schoolId,
        code: 'FRA',
        name: 'Français',
        coefficient: 4,
        hoursPerWeek: 5,
        status: 'active',
      },
    });

    const english = await tenant.subject.create({
      data: {
        schoolId,
        code: 'ANG',
        name: 'Anglais',
        coefficient: 3,
        hoursPerWeek: 3,
        status: 'active',
      },
    });

    const science = await tenant.subject.create({
      data: {
        schoolId,
        code: 'SCI',
        name: 'Sciences Physiques',
        coefficient: 3,
        hoursPerWeek: 4,
        status: 'active',
      },
    });

    const teacher1 = await tenant.user.create({
      data: {
        email: 'm.diop@ecole.sn',
        passwordHash,
        firstName: 'Mamadou',
        lastName: 'Diop',
        role: UserRole.TEACHER,
        phone: '+221 77 123 45 67',
        isActive: true,
        emailVerified: true,
        teacherProfile: {
          create: {
            schoolId,
            primarySubjectId: math.id,
          },
        },
      },
      include: {
        teacherProfile: true,
      },
    });

    const teacher2 = await tenant.user.create({
      data: {
        email: 'f.ba@ecole.sn',
        passwordHash,
        firstName: 'Fatou',
        lastName: 'Ba',
        role: UserRole.TEACHER,
        phone: '+221 78 234 56 78',
        isActive: true,
        emailVerified: true,
        teacherProfile: {
          create: {
            schoolId,
            primarySubjectId: french.id,
          },
        },
      },
      include: {
        teacherProfile: true,
      },
    });

    await tenant.teacherSubject.createMany({
      data: [
        { schoolId, teacherId: teacher1.id, subjectId: math.id },
        { schoolId, teacherId: teacher2.id, subjectId: french.id },
        { schoolId, teacherId: teacher2.id, subjectId: english.id },
      ],
      skipDuplicates: true,
    });

    const levelSeconde = await tenant.level.create({
      data: {
        schoolId,
        name: 'Seconde',
        description: 'Niveau de seconde du secondaire',
        sortOrder: 1,
        status: 'active',
      },
    });

    const levelPremiere = await tenant.level.create({
      data: {
        schoolId,
        name: 'Première',
        description: 'Niveau de première du secondaire',
        sortOrder: 2,
        status: 'active',
      },
    });

    const levelTerminale = await tenant.level.create({
      data: {
        schoolId,
        name: 'Terminale',
        description: 'Niveau de terminale du secondaire',
        sortOrder: 3,
        status: 'active',
      },
    });

    const class1 = await tenant.schoolClass.create({
      data: {
        schoolId,
        academicYearId: activeYear.id,
        levelId: levelTerminale.id,
        name: 'Terminale S1',
        capacity: 40,
        status: 'active',
        headTeacherId: teacher1.id,
      },
    });

    const class2 = await tenant.schoolClass.create({
      data: {
        schoolId,
        academicYearId: activeYear.id,
        levelId: levelTerminale.id,
        name: 'Terminale S2',
        capacity: 40,
        status: 'active',
        headTeacherId: teacher2.id,
      },
    });

    await tenant.classSubject.createMany({
      data: [
        { schoolId, classId: class1.id, subjectId: math.id },
        { schoolId, classId: class1.id, subjectId: french.id },
        { schoolId, classId: class1.id, subjectId: english.id },
        { schoolId, classId: class2.id, subjectId: math.id },
        { schoolId, classId: class2.id, subjectId: science.id },
      ],
      skipDuplicates: true,
    });

    const student1 = await tenant.user.create({
      data: {
        email: 'oumar.fall@eleve.sn',
        passwordHash,
        firstName: 'Oumar',
        lastName: 'Fall',
        role: UserRole.STUDENT,
        phone: '+221 77 111 22 33',
        isActive: true,
        emailVerified: true,
        studentProfile: {
          create: {
            schoolId,
            academicYearId: activeYear.id,
            classId: class1.id,
            average: 14.5,
            enrollmentYear: '2025-2026',
            parentName: 'Mamadou Fall',
            parentPhone: '+221 77 111 22 34',
          },
        },
      },
      include: {
        studentProfile: true,
      },
    });

    const student2 = await tenant.user.create({
      data: {
        email: 'aissatou.diop@eleve.sn',
        passwordHash,
        firstName: 'Aïssatou',
        lastName: 'Diop',
        role: UserRole.STUDENT,
        phone: '+221 78 222 33 44',
        isActive: true,
        emailVerified: true,
        studentProfile: {
          create: {
            schoolId,
            academicYearId: activeYear.id,
            classId: class1.id,
            average: 16.2,
            enrollmentYear: '2025-2026',
            parentName: 'Cheikh Diop',
            parentPhone: '+221 78 222 33 45',
          },
        },
      },
      include: {
        studentProfile: true,
      },
    });

    const student3 = await tenant.user.create({
      data: {
        email: 'ibrahima.sy@eleve.sn',
        passwordHash,
        firstName: 'Ibrahima',
        lastName: 'Sy',
        role: UserRole.STUDENT,
        phone: '+221 76 333 44 55',
        isActive: true,
        emailVerified: true,
        studentProfile: {
          create: {
            schoolId,
            academicYearId: activeYear.id,
            classId: class2.id,
            average: 13.7,
            enrollmentYear: '2025-2026',
            parentName: 'Ousmane Sy',
            parentPhone: '+221 76 333 44 56',
          },
        },
      },
      include: {
        studentProfile: true,
      },
    });

    const parent1 = await tenant.user.create({
      data: {
        email: 'mariama.diop@email.sn',
        passwordHash,
        firstName: 'Mariama',
        lastName: 'Diop',
        role: UserRole.PARENT,
        phone: '+221 77 444 55 66',
        isActive: true,
        emailVerified: true,
        parentProfile: {
          create: {
            schoolId,
            childrenCount: 2,
            primaryClassId: class1.id,
            profession: 'Ingénieure',
          },
        },
      },
      include: {
        parentProfile: true,
      },
    });

    const parent2 = await tenant.user.create({
      data: {
        email: 'cheikh.fall@email.sn',
        passwordHash,
        firstName: 'Cheikh',
        lastName: 'Fall',
        role: UserRole.PARENT,
        phone: '+221 78 555 66 77',
        isActive: true,
        emailVerified: true,
        parentProfile: {
          create: {
            schoolId,
            childrenCount: 1,
            primaryClassId: class2.id,
            profession: 'Commerçant',
          },
        },
      },
      include: {
        parentProfile: true,
      },
    });

    await tenant.staffMember.createMany({
      data: [
        {
          schoolId,
          firstName: 'Moussa',
          lastName: 'Sarr',
          email: 'm.sarr@ecole.sn',
          phone: '+221 77 111 22 33',
          roleKey: 'secretary',
          department: 'Administration',
          hireDate: new Date('2020-09-01'),
          isActive: true,
        },
        {
          schoolId,
          firstName: 'Aminata',
          lastName: 'Diallo',
          email: 'a.diallo@ecole.sn',
          phone: '+221 78 222 33 44',
          roleKey: 'accountant',
          department: 'Finance',
          hireDate: new Date('2019-03-15'),
          isActive: true,
        },
        {
          schoolId,
          firstName: 'Cheikh',
          lastName: 'Ndiaye',
          email: 'c.ndiaye@ecole.sn',
          phone: '+221 76 333 44 55',
          roleKey: 'it_support',
          department: 'Informatique',
          hireDate: new Date('2022-06-10'),
          isActive: true,
        },
      ],
      skipDuplicates: true,
    });

    const timeSlots = await tenant.timeSlot.createMany({
      data: [
        { schoolId, name: '1er créneau', startTime: '08:00', endTime: '09:00' },
        { schoolId, name: '2ème créneau', startTime: '09:00', endTime: '10:00' },
        { schoolId, name: '3ème créneau', startTime: '10:00', endTime: '11:00' },
        { schoolId, name: '4ème créneau', startTime: '11:00', endTime: '12:00' },
      ],
      skipDuplicates: true,
    });

    const slots = await tenant.timeSlot.findMany({
      where: { schoolId },
      orderBy: { startTime: 'asc' },
    });

    const timetable = await tenant.timetable.create({
      data: {
        schoolId,
        academicYearId: activeYear.id,
        semesterId: semester2.id,
        classId: class1.id,
        status: 'active',
      },
    });

    await tenant.timetableEntry.createMany({
      data: [
        {
          schoolId,
          timetableId: timetable.id,
          day: 'Lundi',
          timeSlotId: slots[0].id,
          subjectId: math.id,
          teacherId: teacher1.id,
          classId: class1.id,
          room: 'Salle A101',
        },
        {
          schoolId,
          timetableId: timetable.id,
          day: 'Lundi',
          timeSlotId: slots[1].id,
          subjectId: french.id,
          teacherId: teacher2.id,
          classId: class1.id,
          room: 'Salle A102',
        },
        {
          schoolId,
          timetableId: timetable.id,
          day: 'Mardi',
          timeSlotId: slots[2].id,
          subjectId: english.id,
          teacherId: teacher2.id,
          classId: class1.id,
          room: 'Salle A103',
        },
      ],
    });

    console.log('Tenant demo data seeded successfully.');
  } finally {
    await tenant.$disconnect();
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
