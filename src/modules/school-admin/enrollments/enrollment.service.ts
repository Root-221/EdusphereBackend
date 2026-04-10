import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { EmailService } from '@common/email/email.service';
import { ITenant } from '@common/interfaces/tenant.interface';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { TenantProvisioningService } from '@database/tenant-provisioning.service';
import * as bcrypt from 'bcrypt';
import {
  buildStudentQrCode,
  deriveAcademicYearSuffix,
  formatSequenceCode,
  generateTemporaryPassword,
} from '../shared/enrollment-code.util';
import { withTenantSchemaRepair } from '../shared/schema-repair.util';
import {
  CreateEnrollmentDto,
  CreateEnrollmentPeriodDto,
  CreateReEnrollmentDto,
  EnrollmentPeriodTypeValues,
  EnrollmentStatusValues,
  ListEnrollmentsQueryDto,
  PaymentMethod,
  PaymentMethodValues,
  SetActiveEnrollmentPeriodDto,
  UpdateEnrollmentPeriodDto,
} from './enrollment.dto';

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly tenantDatabaseService: TenantDatabaseService,
    private readonly emailService: EmailService,
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  async listPeriods(tenant: ITenant | null, type?: string): Promise<any[]> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const periods = await client.enrollmentPeriod.findMany({
        where: {
          schoolId,
          ...(type ? { type } : {}),
        },
        include: {
          academicYear: true,
        },
        orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
      });

      return periods.map((period: any) => this.mapPeriod(period));
    });
  }

  async listActivePeriods(tenant: ITenant | null): Promise<any[]> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const periods = await client.enrollmentPeriod.findMany({
        where: {
          schoolId,
          isActive: true,
        },
        include: {
          academicYear: true,
        },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      });

      return periods.map((period: any) => this.mapPeriod(period));
    });
  }

  async createPeriod(tenant: ITenant | null, dto: CreateEnrollmentPeriodDto): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const activeAcademicYear = await this.getActiveAcademicYear(client, schoolId);

      if (!activeAcademicYear) {
        throw new BadRequestException('Aucune année scolaire active n’est disponible.');
      }

      const startDate = new Date(dto.startDate);
      const endDate = new Date(dto.endDate);
      this.ensureValidDateRange(startDate, endDate);

      const period = await client.$transaction(async (tx: any) => {
        await this.ensureSinglePeriodPerAcademicYear(tx, schoolId, activeAcademicYear.id, dto.type);

        const created = await tx.enrollmentPeriod.create({
          data: {
            schoolId,
            academicYearId: activeAcademicYear.id,
            name: dto.name.trim(),
            type: dto.type,
            startDate,
            endDate,
            maxEnrollments: dto.maxEnrollments ?? null,
            description: dto.description?.trim() || null,
            isActive: dto.isActive ?? false,
          },
          include: {
            academicYear: true,
          },
        });

        if (created.isActive) {
          await this.activateEnrollmentPeriod(tx, schoolId, created.id, created.type);
        }

        const refreshed = await tx.enrollmentPeriod.findUnique({
          where: { id: created.id },
          include: { academicYear: true },
        });

        return refreshed ?? created;
      });

      return this.mapPeriod(period);
    });
  }

  async updatePeriod(
    tenant: ITenant | null,
    id: string,
    dto: UpdateEnrollmentPeriodDto,
  ): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const existing = await this.requirePeriod(client, schoolId, id);

      const nextAcademicYearId = dto.academicYearId ?? existing.academicYearId;
      if (dto.academicYearId !== undefined) {
        await this.requireAcademicYear(client, schoolId, dto.academicYearId);
      }
      const nextType = dto.type ?? existing.type;

      const activeAcademicYear = dto.isActive !== false ? await this.getActiveAcademicYear(client, schoolId) : null;

      const nextStartDate = dto.startDate !== undefined ? new Date(dto.startDate) : existing.startDate;
      const nextEndDate = dto.endDate !== undefined ? new Date(dto.endDate) : existing.endDate;
      this.ensureValidDateRange(nextStartDate, nextEndDate);

      const period = await client.$transaction(async (tx: any) => {
        await this.ensureSinglePeriodPerAcademicYear(
          tx,
          schoolId,
          nextAcademicYearId,
          nextType,
          id,
        );

        const updated = await tx.enrollmentPeriod.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.type !== undefined ? { type: dto.type } : {}),
            ...(dto.academicYearId !== undefined ? { academicYearId: dto.academicYearId } : {}),
            ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
            ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
            ...(dto.maxEnrollments !== undefined ? { maxEnrollments: dto.maxEnrollments } : {}),
            ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          include: {
            academicYear: true,
          },
        });

        if (updated.isActive) {
          if (!activeAcademicYear || activeAcademicYear.id !== updated.academicYearId) {
            throw new BadRequestException(
              'Une période active doit appartenir à l’année scolaire active.',
            );
          }
          await this.activateEnrollmentPeriod(tx, schoolId, updated.id, updated.type);
        }

        const refreshed = await tx.enrollmentPeriod.findUnique({
          where: { id: updated.id },
          include: { academicYear: true },
        });

        return refreshed ?? updated;
      });

      return this.mapPeriod(period);
    });
  }

  async deletePeriod(tenant: ITenant | null, id: string): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const existing = await this.requirePeriod(client, schoolId, id);

      const linkedEnrollments = await client.enrollment.count({
        where: { schoolId, periodId: id },
      });

      if (linkedEnrollments > 0) {
        throw new BadRequestException(
          'Impossible de supprimer une période déjà utilisée par des inscriptions.',
        );
      }

      await client.enrollmentPeriod.delete({ where: { id } });

      return this.mapPeriod(existing);
    });
  }

  async setActivePeriod(tenant: ITenant | null, dto: SetActiveEnrollmentPeriodDto): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const period = await this.requirePeriod(client, schoolId, dto.periodId);
      const activeAcademicYear = await this.getActiveAcademicYear(client, schoolId);

      if (!activeAcademicYear) {
        throw new BadRequestException('Aucune année scolaire active n’est disponible.');
      }

      if (period.academicYearId !== activeAcademicYear.id) {
        throw new BadRequestException(
          'La période active doit appartenir à l’année scolaire active.',
        );
      }

      const updated = await client.$transaction(async (tx: any) => {
        await this.activateEnrollmentPeriod(tx, schoolId, period.id, period.type);

        const refreshed = await tx.enrollmentPeriod.findUnique({
          where: { id: period.id },
          include: { academicYear: true },
        });

        return refreshed ?? period;
      });

      return this.mapPeriod(updated);
    });
  }

  async listEnrollments(
    tenant: ITenant | null,
    query: ListEnrollmentsQueryDto = {},
  ): Promise<any[]> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const where: any = {
        schoolId,
        ...(query.periodId ? { periodId: query.periodId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.levelId ? { levelId: query.levelId } : {}),
        ...(query.search
          ? {
              OR: [
                { enrollmentNumber: { contains: query.search, mode: 'insensitive' } },
                { matricule: { contains: query.search, mode: 'insensitive' } },
                {
                  studentUser: {
                    is: {
                      OR: [
                        { firstName: { contains: query.search, mode: 'insensitive' } },
                        { lastName: { contains: query.search, mode: 'insensitive' } },
                        { email: { contains: query.search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      };

      const enrollments = await client.enrollment.findMany({
        where,
        include: this.enrollmentInclude(),
        orderBy: { createdAt: 'desc' },
      });

      return enrollments.map((enrollment: any) => this.mapEnrollment(enrollment));
    });
  }

  async findLatestEnrollmentByMatricule(tenant: ITenant | null, matricule: string): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const enrollment = await client.enrollment.findFirst({
        where: {
          schoolId,
          matricule: matricule.trim(),
        },
        include: this.enrollmentInclude(),
        orderBy: [{ createdAt: 'desc' }],
      });

      if (!enrollment) {
        throw new NotFoundException('Aucune inscription trouvée pour ce matricule.');
      }

      return this.mapEnrollment(enrollment);
    });
  }

  async findStudentByMatricule(tenant: ITenant | null, matricule: string): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const student = await client.user.findFirst({
        where: {
          role: 'STUDENT',
          studentProfile: {
            is: {
              schoolId,
              matricule: matricule.trim(),
            },
          },
        },
        include: {
          studentProfile: {
            include: {
              academicYear: true,
              class: {
                include: {
                  level: true,
                },
              },
              parentUser: {
                include: {
                  parentProfile: true,
                },
              },
            },
          },
        },
      });

      if (!student) {
        throw new NotFoundException('Élève introuvable');
      }

      return this.mapStudentLookup(student);
    });
  }

  async createEnrollment(tenant: ITenant | null, dto: CreateEnrollmentDto): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, () =>
      this.createEnrollmentInternal(tenant, {
        ...dto,
        type: EnrollmentPeriodTypeValues.new,
      }),
    );
  }

  async createReEnrollment(tenant: ITenant | null, dto: CreateReEnrollmentDto): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, () =>
      this.createReEnrollmentInternal(tenant, dto),
    );
  }

  private async createEnrollmentInternal(
    tenant: ITenant | null,
    dto: CreateEnrollmentDto & { type: string },
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const school = this.requireTenant(tenant);
    const studentEmail = dto.studentEmail.trim().toLowerCase();
    const parentEmail = dto.parentEmail.trim().toLowerCase();

    if (studentEmail === parentEmail) {
      throw new BadRequestException('L’adresse email de l’élève doit être différente de celle du parent.');
    }

    const activeAcademicYear = await this.getActiveAcademicYear(client, school.id);
    const activeSemester = activeAcademicYear
      ? await this.getActiveSemester(client, school.id, activeAcademicYear.id)
      : null;

    if (!activeAcademicYear) {
      throw new BadRequestException('Aucune année scolaire active n’est disponible.');
    }
    if (!activeSemester) {
      throw new BadRequestException('Aucun semestre actif n’est disponible.');
    }

    const period = dto.periodId
      ? await this.requirePeriod(client, school.id, dto.periodId)
      : await this.getActivePeriodForType(client, school.id, EnrollmentPeriodTypeValues.new);

    if (!period) {
      throw new BadRequestException('Aucune période active de nouvelle inscription n’est disponible.');
    }

    if (!period.isActive) {
      throw new BadRequestException('La période sélectionnée est inactive.');
    }

    if (period.type !== EnrollmentPeriodTypeValues.new) {
      throw new BadRequestException('La période sélectionnée ne correspond pas à une nouvelle inscription.');
    }

    if (period.academicYearId !== activeAcademicYear.id) {
      throw new BadRequestException('La période doit appartenir à l’année scolaire active.');
    }

    const schoolClass = await this.requireClass(client, school.id, dto.classId);
    if (schoolClass.academicYearId && schoolClass.academicYearId !== activeAcademicYear.id) {
      throw new BadRequestException('La classe sélectionnée n’appartient pas à l’année scolaire active.');
    }
    if (schoolClass.levelId === null || schoolClass.levelId === undefined) {
      throw new BadRequestException('La classe sélectionnée doit être liée à un niveau.');
    }

    const existingStudentEmail = await client.user.findFirst({
      where: {
        email: studentEmail,
      },
    });

    if (existingStudentEmail) {
      throw new ConflictException('Un compte élève existe déjà avec cet email.');
    }

    const paymentMethod = dto.paymentMethod ?? 'cash';
    const paymentAmount = dto.paymentAmount ?? 0;
    const studentPassword = generateTemporaryPassword();
    const parentPassword = generateTemporaryPassword();
    const [studentPasswordHash, parentPasswordHash] = await Promise.all([
      bcrypt.hash(studentPassword, 12),
      bcrypt.hash(parentPassword, 12),
    ]);

    const created = await client.$transaction(
      async (tx: any) => {
        const periodEnrollmentCount = await tx.enrollment.count({
          where: {
            schoolId: school.id,
            periodId: period.id,
          },
        });

        if (period.maxEnrollments && periodEnrollmentCount >= period.maxEnrollments) {
          throw new BadRequestException('La période sélectionnée a atteint son quota maximal.');
        }

        const classCapacityCount = await tx.studentProfile.count({
          where: {
            schoolId: school.id,
            classId: schoolClass.id,
          },
        });
        if (classCapacityCount >= schoolClass.capacity) {
          throw new BadRequestException('La classe sélectionnée est complète.');
        }

        const parentResult = await this.upsertParentAccount(tx, school, dto, parentPasswordHash, parentPassword);
        const matricule = await this.generateMatricule(tx, school.id, activeAcademicYear.name);
        const qrCode = buildStudentQrCode(school.slug, matricule);
        const studentUser = await tx.user.create({
          data: {
            email: studentEmail,
            passwordHash: studentPasswordHash,
            firstName: dto.studentFirstName.trim(),
            lastName: dto.studentLastName.trim(),
            role: 'STUDENT',
            phone: dto.studentPhone?.trim() || null,
            isActive: true,
            emailVerified: true,
          },
        });

        const studentProfile = await tx.studentProfile.create({
          data: {
            schoolId: school.id,
            userId: studentUser.id,
            parentUserId: parentResult.user.id,
            academicYearId: activeAcademicYear.id,
            classId: schoolClass.id,
            average: 0,
            matricule,
            qrCode,
            enrollmentYear: activeAcademicYear.name,
            dateOfBirth: dto.studentDateOfBirth ? new Date(dto.studentDateOfBirth) : null,
            gender: dto.studentGender?.trim() || null,
            address: dto.studentAddress?.trim() || null,
            previousSchool: dto.studentPreviousSchool?.trim() || null,
            parentName: `${dto.parentFirstName.trim()} ${dto.parentLastName.trim()}`.trim(),
            parentPhone: dto.parentPhone?.trim() || null,
          },
        });

        const enrollmentNumber = await this.generateEnrollmentNumber(
          tx,
          school.id,
          activeAcademicYear.name,
          'INS',
        );
        const receiptNumber = `REC-${enrollmentNumber}`;
        const enrollment = await tx.enrollment.create({
          data: {
            schoolId: school.id,
            type: EnrollmentPeriodTypeValues.new,
            periodId: period.id,
            studentUserId: studentUser.id,
            parentUserId: parentResult.user.id,
            matricule,
            qrCode,
            academicYearId: activeAcademicYear.id,
            semesterId: activeSemester.id,
            classId: schoolClass.id,
            levelId: schoolClass.levelId ?? null,
            previousClassId: null,
            enrollmentNumber,
            receiptNumber,
            status: EnrollmentStatusValues.paid,
            paymentStatus: 'completed',
            paymentMethod,
            paymentAmount,
            paymentReference: receiptNumber,
            paymentDate: new Date(),
            confirmedAt: new Date(),
            notes: dto.notes?.trim() || null,
          },
          include: this.enrollmentInclude(),
        });

        return {
          enrollment,
          emailPayload: {
            school,
            student: {
              user: studentUser,
              profile: studentProfile,
              password: studentPassword,
            },
            parent: {
              user: parentResult.user,
              profile: parentResult.profile,
              password: parentResult.password,
            },
            enrollment,
            className: schoolClass.name,
            academicYearName: activeAcademicYear.name,
            semesterName: activeSemester.name,
            paymentAmount,
          },
        };
      },
      {
        timeout: 15000,
        maxWait: 15000,
      },
    );

    if (created.emailPayload) {
      try {
        await this.sendEnrollmentEmails(created.emailPayload);
      } catch (error) {
        this.logger.warn(
          `Inscription ${created.enrollment.enrollmentNumber} enregistrée, mais l’envoi des emails a échoué: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return this.mapEnrollment(created.enrollment);
  }

  private async createReEnrollmentInternal(
    tenant: ITenant | null,
    dto: CreateReEnrollmentDto,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const school = this.requireTenant(tenant);
    const matricule = dto.matricule.trim();
    const activeAcademicYear = await this.getActiveAcademicYear(client, school.id);
    const activeSemester = activeAcademicYear
      ? await this.getActiveSemester(client, school.id, activeAcademicYear.id)
      : null;

    if (!activeAcademicYear) {
      throw new BadRequestException('Aucune année scolaire active n’est disponible.');
    }
    if (!activeSemester) {
      throw new BadRequestException('Aucun semestre actif n’est disponible.');
    }

    const period = dto.periodId
      ? await this.requirePeriod(client, school.id, dto.periodId)
      : await this.getActivePeriodForType(client, school.id, EnrollmentPeriodTypeValues.re_enrollment);

    if (!period) {
      throw new BadRequestException('Aucune période active de réinscription n’est disponible.');
    }

    if (!period.isActive) {
      throw new BadRequestException('La période sélectionnée est inactive.');
    }

    if (period.type !== EnrollmentPeriodTypeValues.re_enrollment) {
      throw new BadRequestException('La période sélectionnée ne correspond pas à une réinscription.');
    }

    if (period.academicYearId !== activeAcademicYear.id) {
      throw new BadRequestException('La période doit appartenir à l’année scolaire active.');
    }

    const student = await this.requireStudentByMatricule(client, school.id, dto.matricule);
    const schoolClass = await this.requireClass(client, school.id, dto.classId);

    if (schoolClass.academicYearId && schoolClass.academicYearId !== activeAcademicYear.id) {
      throw new BadRequestException('La classe sélectionnée n’appartient pas à l’année scolaire active.');
    }

    if (schoolClass.levelId === null || schoolClass.levelId === undefined) {
      throw new BadRequestException('La classe sélectionnée doit être liée à un niveau.');
    }

    const paymentMethod = dto.paymentMethod ?? 'cash';
    const paymentAmount = dto.paymentAmount ?? 0;
    const created = await client.$transaction(
      async (tx: any) => {
        const periodEnrollmentCount = await tx.enrollment.count({
          where: {
            schoolId: school.id,
            periodId: period.id,
          },
        });

        if (period.maxEnrollments && periodEnrollmentCount >= period.maxEnrollments) {
          throw new BadRequestException('La période sélectionnée a atteint son quota maximal.');
        }

        const classCapacityCount = await tx.studentProfile.count({
          where: {
            schoolId: school.id,
            classId: schoolClass.id,
            userId: { not: student.user.id },
          },
        });
        if (classCapacityCount >= schoolClass.capacity) {
          throw new BadRequestException('La classe sélectionnée est complète.');
        }

        const studentProfile = await tx.studentProfile.findFirst({
          where: { schoolId: school.id, userId: student.user.id },
        });

        if (!studentProfile) {
          throw new NotFoundException('Le profil élève est introuvable.');
        }

        const previousClassId = studentProfile.classId ?? null;

        await tx.studentProfile.update({
          where: { userId: student.user.id },
          data: {
            academicYearId: activeAcademicYear.id,
            classId: schoolClass.id,
            enrollmentYear: activeAcademicYear.name,
          },
        });

        const enrollmentNumber = await this.generateEnrollmentNumber(
          tx,
          school.id,
          activeAcademicYear.name,
          'REINS',
        );
        const receiptNumber = `REC-${enrollmentNumber}`;
        const enrollment = await tx.enrollment.create({
          data: {
            schoolId: school.id,
            type: EnrollmentPeriodTypeValues.re_enrollment,
            periodId: period.id,
            studentUserId: student.user.id,
            parentUserId: student.profile.parentUserId ?? null,
            matricule,
            qrCode: student.profile.qrCode ?? buildStudentQrCode(school.slug, matricule),
            academicYearId: activeAcademicYear.id,
            semesterId: activeSemester.id,
            classId: schoolClass.id,
            levelId: schoolClass.levelId ?? null,
            previousClassId,
            enrollmentNumber,
            receiptNumber,
            status: EnrollmentStatusValues.paid,
            paymentStatus: 'completed',
            paymentMethod,
            paymentAmount,
            paymentReference: receiptNumber,
            paymentDate: new Date(),
            confirmedAt: new Date(),
            notes: dto.notes?.trim() || null,
          },
          include: this.enrollmentInclude(),
        });

        return enrollment;
      },
      {
        timeout: 15000,
        maxWait: 15000,
      },
    );

    return this.mapEnrollment(created);
  }

  private async upsertParentAccount(
    tx: any,
    school: ITenant,
    dto: CreateEnrollmentDto,
    passwordHash: string,
    password: string,
  ) {
    const email = dto.parentEmail.trim().toLowerCase();
    const existing = await tx.user.findFirst({
      where: { email },
      include: {
        parentProfile: true,
      },
    });

    if (!existing) {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.parentFirstName.trim(),
          lastName: dto.parentLastName.trim(),
          role: 'PARENT',
          phone: dto.parentPhone?.trim() || null,
          isActive: true,
          emailVerified: true,
        },
      });

      const profile = await tx.parentProfile.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          childrenCount: 1,
          profession: dto.parentProfession?.trim() || null,
        },
      });

      return { user, profile, password };
    }

    if (existing.role !== 'PARENT') {
      throw new ConflictException('Un compte existe déjà avec cet email parent.');
    }

    await tx.session.deleteMany({ where: { userId: existing.id } });

    const user = await tx.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        firstName: dto.parentFirstName.trim(),
        lastName: dto.parentLastName.trim(),
        phone: dto.parentPhone?.trim() || null,
        isActive: true,
        emailVerified: true,
      },
    });

    const profile = existing.parentProfile
      ? await tx.parentProfile.update({
          where: { userId: existing.id },
          data: {
            profession: dto.parentProfession?.trim() || existing.parentProfile.profession,
            childrenCount: { increment: 1 },
          },
        })
      : await tx.parentProfile.create({
          data: {
            schoolId: school.id,
            userId: user.id,
            childrenCount: 1,
            profession: dto.parentProfession?.trim() || null,
          },
        });

    return { user, profile, password };
  }

  private async generateMatricule(client: any, schoolId: string, academicYearName?: string): Promise<string> {
    const suffix = deriveAcademicYearSuffix(academicYearName);
    const sequence = await this.nextSequence(client, schoolId, deriveAcademicYearSuffix(academicYearName), 'matricule');
    return formatSequenceCode('SCH', suffix, sequence);
  }

  private async generateEnrollmentNumber(
    client: any,
    schoolId: string,
    academicYearName: string,
    kind: 'INS' | 'REINS',
  ): Promise<string> {
    const suffix = deriveAcademicYearSuffix(academicYearName);
    const sequence = await this.nextSequence(client, schoolId, suffix, 'enrollment');
    return formatSequenceCode(kind, suffix, sequence);
  }

  private async nextSequence(
    client: any,
    schoolId: string,
    academicYearSuffix: string,
    kind: string,
  ): Promise<number> {
    const existingMax = await this.getExistingSequenceMax(client, schoolId, academicYearSuffix, kind);
    const where = {
      schoolId_academicYearId_kind: {
        schoolId,
        academicYearId: academicYearSuffix,
        kind,
      },
    };

    const counter = await client.sequenceCounter.findUnique({
      where,
    });

    if (!counter) {
      const created = await client.sequenceCounter.create({
        data: {
          schoolId,
          academicYearId: academicYearSuffix,
          kind,
          currentValue: Math.max(1, existingMax + 1),
        },
      });

      return created.currentValue;
    }

    const nextValue = Math.max(counter.currentValue, existingMax) + 1;

    if (counter.currentValue < existingMax) {
      const updated = await client.sequenceCounter.update({
        where,
        data: {
          currentValue: nextValue,
        },
      });

      return updated.currentValue;
    }

    const updated = await client.sequenceCounter.update({
      where,
      data: {
        currentValue: { increment: 1 },
      },
    });

    return updated.currentValue;
  }

  private async getExistingSequenceMax(
    client: any,
    schoolId: string,
    academicYearSuffix: string,
    kind: string,
  ): Promise<number> {
    if (kind === 'matricule') {
      const prefix = `SCH-${academicYearSuffix}-`;
      const records = await client.studentProfile.findMany({
        where: {
          schoolId,
          matricule: {
            startsWith: prefix,
          },
        },
        select: {
          matricule: true,
        },
      });

      return this.maxSequenceFromCodes(
        records.map((record: { matricule: string | null }) => record.matricule).filter((value): value is string => Boolean(value)),
        [prefix],
      );
    }

    const prefixes = [`INS-${academicYearSuffix}-`, `REINS-${academicYearSuffix}-`];
    const records = await client.enrollment.findMany({
      where: {
        schoolId,
        OR: prefixes.map((prefix) => ({
          enrollmentNumber: {
            startsWith: prefix,
          },
        })),
      },
      select: {
        enrollmentNumber: true,
      },
    });

    return this.maxSequenceFromCodes(
      records
        .map((record: { enrollmentNumber: string }) => record.enrollmentNumber)
        .filter((value): value is string => Boolean(value)),
      prefixes,
    );
  }

  private maxSequenceFromCodes(codes: string[], prefixes: string[]): number {
    return codes.reduce((max, code) => {
      const value = this.extractSequenceValue(code, prefixes);
      return value > max ? value : max;
    }, 0);
  }

  private extractSequenceValue(code: string, prefixes: string[]): number {
    for (const prefix of prefixes) {
      if (code.startsWith(prefix)) {
        const value = Number.parseInt(code.slice(prefix.length), 10);
        return Number.isFinite(value) ? value : 0;
      }
    }

    return 0;
  }

  private async sendEnrollmentEmails(params: {
    school: ITenant;
    student: {
      user: any;
      profile: any;
      password: string;
    };
    parent: {
      user: any;
      profile: any;
      password: string;
    };
    enrollment: any;
    className: string;
    academicYearName: string;
    semesterName: string;
    paymentAmount: number;
  }): Promise<void> {
    const receiptNumber = params.enrollment.receiptNumber;
    const matricule = params.enrollment.matricule;
    const baseParams = {
      schoolName: params.school.name,
      tenantSlug: params.school.slug,
      matricule,
      enrollmentNumber: params.enrollment.enrollmentNumber,
      receiptNumber,
      amount: params.paymentAmount,
      academicYear: params.academicYearName,
      semester: params.semesterName,
      className: params.className,
    };

    await Promise.all([
      this.emailService.sendEnrollmentCredentials({
        to: params.student.user.email,
        firstName: params.student.user.firstName,
        accountLabel: 'élève',
        login: params.student.user.email,
        password: params.student.password,
        ...baseParams,
      }),
      this.emailService.sendEnrollmentCredentials({
        to: params.parent.user.email,
        firstName: params.parent.user.firstName,
        accountLabel: 'parent',
        login: params.parent.user.email,
        password: params.parent.password,
        ...baseParams,
      }),
    ]);
  }

  private async requirePeriod(client: any, schoolId: string, id: string): Promise<any> {
    const period = await client.enrollmentPeriod.findFirst({
      where: { id, schoolId },
      include: { academicYear: true },
    });

    if (!period) {
      throw new NotFoundException('Période introuvable');
    }

    return period;
  }

  private async getActivePeriodForType(client: any, schoolId: string, type: string): Promise<any | null> {
    return client.enrollmentPeriod.findFirst({
      where: {
        schoolId,
        type,
        isActive: true,
      },
      include: {
        academicYear: true,
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async ensureSinglePeriodPerAcademicYear(
    client: any,
    schoolId: string,
    academicYearId: string,
    type: string,
    excludePeriodId?: string,
  ): Promise<void> {
    const conflict = await client.enrollmentPeriod.findFirst({
      where: {
        schoolId,
        academicYearId,
        type,
        ...(excludePeriodId ? { id: { not: excludePeriodId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (conflict) {
      throw new ConflictException(
        `Une seule période de ${this.getPeriodTypeLabel(type)} est autorisée par année scolaire.`,
      );
    }
  }

  private getPeriodTypeLabel(type: string): string {
    return type === EnrollmentPeriodTypeValues.re_enrollment
      ? 'réinscription'
      : 'nouvelle inscription';
  }

  private async requireAcademicYear(client: any, schoolId: string, id: string): Promise<any> {
    const year = await client.academicYear.findFirst({
      where: { id, schoolId },
    });

    if (!year) {
      throw new NotFoundException('Année scolaire introuvable');
    }

    return year;
  }

  private async getActiveAcademicYear(client: any, schoolId: string): Promise<any | null> {
    return client.academicYear.findFirst({
      where: {
        schoolId,
        status: 'active',
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async getActiveSemester(client: any, schoolId: string, academicYearId: string): Promise<any | null> {
    return client.semester.findFirst({
      where: {
        schoolId,
        academicYearId,
        status: 'active',
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async requireClass(client: any, schoolId: string, id: string): Promise<any> {
    const schoolClass = await client.schoolClass.findFirst({
      where: { id, schoolId },
      include: {
        level: true,
      },
    });

    if (!schoolClass) {
      throw new NotFoundException('Classe introuvable');
    }

    return schoolClass;
  }

  private async requireStudentByMatricule(client: any, schoolId: string, matricule: string): Promise<any> {
    const student = await client.user.findFirst({
      where: {
        role: 'STUDENT',
        studentProfile: {
          is: {
            schoolId,
            matricule: matricule.trim(),
          },
        },
      },
      include: {
        studentProfile: {
          include: {
            academicYear: true,
            class: {
              include: {
                level: true,
              },
            },
            parentUser: {
              include: {
                parentProfile: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Élève introuvable');
    }

    return student;
  }

  private enrollmentInclude(): any {
    return {
      period: {
        include: {
          academicYear: true,
        },
      },
      academicYear: true,
      semester: true,
      class: {
        include: {
          level: true,
          academicYear: true,
          students: {
            select: {
              id: true,
            },
          },
        },
      },
      level: true,
      studentUser: {
        include: {
          studentProfile: {
            include: {
              academicYear: true,
              class: {
                include: {
                  level: true,
                },
              },
              parentUser: {
                include: {
                  parentProfile: true,
                },
              },
            },
          },
        },
      },
      parentUser: {
        include: {
          parentProfile: true,
        },
      },
    };
  }

  private mapPeriod(period: any): any {
    return {
      id: period.id,
      name: period.name,
      type: period.type,
      academicYearId: period.academicYearId,
      academicYear: period.academicYear?.name ?? '',
      startDate: this.toDateOnly(period.startDate),
      endDate: this.toDateOnly(period.endDate),
      isActive: Boolean(period.isActive),
      maxEnrollments: period.maxEnrollments ?? undefined,
      description: period.description ?? '',
    };
  }

  private mapStudentLookup(student: any): any {
    const profile = student.studentProfile;
    const parentUser = profile?.parentUser;
    const parentNameParts = (profile?.parentName ?? '').trim().split(/\s+/).filter(Boolean);
    return {
      id: student.id,
      firstName: student.firstName,
      name: student.lastName,
      email: student.email,
      phone: student.phone ?? '',
      matricule: profile?.matricule ?? '',
      qrCode: profile?.qrCode ?? '',
      classId: profile?.classId ?? '',
      class: profile?.class?.name ?? '',
      levelId: profile?.class?.levelId ?? '',
      level: profile?.class?.level?.name ?? '',
      academicYearId: profile?.academicYearId ?? '',
      academicYear: profile?.academicYear?.name ?? '',
      status: student.isActive ? 'active' : 'inactive',
      average: profile?.average ?? 0,
      enrollmentYear: profile?.enrollmentYear ?? '',
      parentName:
        profile?.parentName ??
        (parentUser ? `${parentUser.firstName} ${parentUser.lastName}`.trim() : ''),
      parentFirstName: parentUser?.firstName ?? parentNameParts[0] ?? '',
      parentLastName: parentUser?.lastName ?? parentNameParts.slice(1).join(' ') ?? '',
      parentPhone: profile?.parentPhone ?? parentUser?.phone ?? '',
      parentEmail: parentUser?.email ?? '',
      parentUserId: profile?.parentUserId ?? '',
      dateOfBirth: profile?.dateOfBirth ? this.toDateOnly(profile.dateOfBirth) : '',
      gender: profile?.gender ?? '',
      address: profile?.address ?? '',
      previousSchool: profile?.previousSchool ?? '',
    };
  }

  private mapEnrollment(enrollment: any): any {
    const studentUser = enrollment.studentUser;
    const studentProfile = studentUser?.studentProfile;
    const parentUser = enrollment.parentUser ?? studentProfile?.parentUser ?? null;
    const schoolClass = enrollment.class;
    const level = enrollment.level ?? schoolClass?.level ?? null;
    const academicYear = enrollment.academicYear ?? enrollment.period?.academicYear ?? null;
    const semester = enrollment.semester ?? null;
    const paymentMethod = enrollment.paymentMethod ?? 'cash';

    return {
      id: enrollment.id,
      enrollmentNumber: enrollment.enrollmentNumber,
      type: enrollment.type,
      status: enrollment.status,
      academicYear: academicYear?.name ?? '',
      periodId: enrollment.periodId,
      createdAt: this.toDateOnly(enrollment.createdAt),
      updatedAt: this.toDateOnly(enrollment.updatedAt),
      confirmedAt: enrollment.confirmedAt ? this.toDateOnly(enrollment.confirmedAt) : undefined,
      administrativeStatus: enrollment.status === EnrollmentStatusValues.paid ? 'completed' : 'pending',
      studentInfo: {
        firstName: studentUser?.firstName ?? '',
        lastName: studentUser?.lastName ?? '',
        email: studentUser?.email ?? '',
        phone: studentUser?.phone ?? '',
        dateOfBirth: studentProfile?.dateOfBirth ? this.toDateOnly(studentProfile.dateOfBirth) : '',
        gender: studentProfile?.gender ?? '',
        address: studentProfile?.address ?? '',
        previousSchool: studentProfile?.previousSchool ?? '',
        matricule: enrollment.matricule,
        qrCode: enrollment.qrCode,
      },
      parentInfo: {
        firstName: parentUser?.firstName ?? '',
        lastName: parentUser?.lastName ?? '',
        email: parentUser?.email ?? '',
        phone: parentUser?.phone ?? '',
        profession: parentUser?.parentProfile?.profession ?? '',
        address: '',
        isGuardian: true,
      },
      pedagogicalStatus: 'completed',
      classAssignment: schoolClass
        ? {
            classId: schoolClass.id,
            className: schoolClass.name,
            capacity: schoolClass.capacity,
            currentStudents: schoolClass.students?.length ?? 0,
          }
        : undefined,
      selectedSubjects: [],
      payment: {
        id: enrollment.id,
        amount: enrollment.paymentAmount ?? 0,
        method: paymentMethod,
        status: enrollment.paymentStatus ?? 'completed',
        transactionId: enrollment.paymentReference ?? enrollment.receiptNumber,
        paymentDate: enrollment.paymentDate ? this.toDateOnly(enrollment.paymentDate) : undefined,
        collectedBy: enrollment.status === EnrollmentStatusValues.paid ? 'Scolarité' : undefined,
        notes: enrollment.notes ?? '',
        receiptNumber: enrollment.receiptNumber,
      },
      existingStudentId: studentUser?.id ?? undefined,
      matricule: enrollment.matricule,
      qrCode: enrollment.qrCode,
      receiptNumber: enrollment.receiptNumber,
      period: enrollment.period
        ? {
            id: enrollment.period.id,
            name: enrollment.period.name,
            type: enrollment.period.type,
            academicYear: enrollment.period.academicYear?.name ?? '',
          }
        : undefined,
      academicYearId: enrollment.academicYearId,
      semesterId: enrollment.semesterId,
      classId: enrollment.classId,
      levelId: level?.id ?? '',
      level: level?.name ?? '',
    };
  }

  private async getClient(tenant: ITenant | null): Promise<any> {
    const resolvedTenant = this.requireTenant(tenant);
    return this.tenantDatabaseService.getClientForTenant(resolvedTenant);
  }

  private requireTenant(tenant: ITenant | null): ITenant {
    if (!tenant) {
      throw new BadRequestException('Le tenant de l’école est requis pour cette opération.');
    }
    return tenant;
  }

  private async activateEnrollmentPeriod(
    tx: any,
    schoolId: string,
    periodId: string,
    type: string,
  ): Promise<void> {
    await tx.enrollmentPeriod.updateMany({
      where: {
        schoolId,
        type,
        id: { not: periodId },
      },
      data: {
        isActive: false,
      },
    });

    await tx.enrollmentPeriod.update({
      where: { id: periodId },
      data: { isActive: true },
    });
  }

  private ensureValidDateRange(startDate: Date, endDate: Date): void {
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Les dates fournies sont invalides.');
    }

    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('La date de fin doit être postérieure à la date de début.');
    }
  }

  private toDateOnly(value?: Date | string | null): string {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString().slice(0, 10);
  }
}
