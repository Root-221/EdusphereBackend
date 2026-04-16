import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { TenantProvisioningService } from '@database/tenant-provisioning.service';
import { ITenant } from '@common/interfaces/tenant.interface';
import { EmailService } from '@common/email/email.service';
import {
  buildStudentQrCode,
  deriveAcademicYearSuffix,
  formatSequenceCode,
} from '../shared/enrollment-code.util';
import { refreshCompletedSemesterAverages } from '../shared/semester-average.util';
import { withTenantSchemaRepair } from '../shared/schema-repair.util';
import {
  CreateParentDto,
  CreateStaffDto,
  CreateStudentDto,
  CreateTeacherDto,
  StaffRoleValues,
  ListStudentsQueryDto,
  UpdateParentDto,
  UpdateStaffDto,
  UpdateStudentDto,
  UpdateTeacherDto,
} from './users.dto';

const DEFAULT_TEMP_PASSWORD = 'Password123!';

const STAFF_ROLE_LABELS: Record<string, string> = {
  secretary: 'Secretaire',
  accountant: 'Comptable',
  librarian: 'Bibliothecaire',
  it_support: 'Support IT',
  pedagogical_counselor: 'Conseiller pedagogique',
  administrative_assistant: 'Assistant administratif',
  studies_director: 'Directeur des etudes',
  bursar: 'Intendant',
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly tenantDatabaseService: TenantDatabaseService,
    private readonly config: ConfigService,
    private readonly tenantProvisioningService: TenantProvisioningService,
    private readonly emailService: EmailService,
  ) {}

  async listTeachers(tenant: ITenant | null): Promise<any[]> {
    const client = await this.getClient(tenant);
    const teachers = await client.user.findMany({
      where: { role: 'TEACHER' },
      include: {
        teacherProfile: {
          include: {
            primarySubject: true,
            subjectLinks: { include: { subject: true } },
            classLinks: { include: { class: { include: { level: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return teachers.map((teacher: any) => this.mapTeacher(teacher));
  }

  async createTeacher(tenant: ITenant | null, dto: CreateTeacherDto): Promise<any> {
    const client = await this.getClient(tenant);
    const { tempPassword, passwordHash } = await this.buildTempPassword();
    const classIds = (dto.classIds ?? []).filter(Boolean);

    const created = await client.$transaction(async (tx: any) => {
      if (classIds.length > 0) {
        await this.requireClasses(tx, this.requireTenant(tenant).id, classIds);
      }

      const user = await tx.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.name.trim(),
          role: 'TEACHER',
          phone: dto.phone?.trim() || null,
          isActive: dto.isActive ?? true,
          emailVerified: true,
          mustChangePassword: true,
        },
      });

      await tx.teacherProfile.create({
        data: {
          schoolId: this.requireTenant(tenant).id,
          userId: user.id,
          primarySubjectId: dto.subjectId ?? null,
        },
      });

      if (dto.subjectId) {
        await tx.teacherSubject.create({
          data: {
            schoolId: this.requireTenant(tenant).id,
            teacherId: user.id,
            subjectId: dto.subjectId,
          },
        });
      }

      if (classIds.length > 0) {
        await tx.teacherClass.createMany({
          data: classIds.map((classId) => ({
            schoolId: this.requireTenant(tenant).id,
            teacherId: user.id,
            classId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.user.findUnique({
        where: { id: user.id },
        include: {
          teacherProfile: {
            include: {
              primarySubject: true,
              subjectLinks: { include: { subject: true } },
              classLinks: { include: { class: { include: { level: true } } } },
            },
          },
        },
      });
    });

    this.sendUserInviteEmailAsync({
      tenant,
      email: dto.email,
      firstName: dto.firstName,
      accountLabel: 'enseignant',
      tempPassword,
    }).catch((err) => {
      this.logger.warn(`Teacher email failed for ${dto.email}: ${err.message}`);
    });

    return this.mapTeacher(created);
  }

  async updateTeacher(tenant: ITenant | null, id: string, dto: UpdateTeacherDto): Promise<any> {
    const client = await this.getClient(tenant);
    const existing = await this.requireTeacher(client, id);
    const classIds = dto.classIds ? dto.classIds.filter(Boolean) : undefined;

    const updated = await client.$transaction(async (tx: any) => {
      if (classIds !== undefined && classIds.length > 0) {
        await this.requireClasses(tx, this.requireTenant(tenant).id, classIds);
      }

      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.name !== undefined ? { lastName: dto.name.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      if (dto.subjectId !== undefined) {
        await tx.teacherProfile.update({
          where: { userId: id },
          data: { primarySubjectId: dto.subjectId || null },
        });

        await tx.teacherSubject.deleteMany({
          where: { teacherId: id },
        });

        if (dto.subjectId) {
          await tx.teacherSubject.create({
            data: {
              schoolId: existing.teacherProfile?.schoolId ?? this.requireTenant(tenant).id,
              teacherId: id,
              subjectId: dto.subjectId,
            },
          });
        }
      }

      if (classIds !== undefined) {
        await tx.teacherClass.deleteMany({ where: { teacherId: id } });
        if (classIds.length > 0) {
          await tx.teacherClass.createMany({
            data: classIds.map((classId) => ({
              schoolId: existing.teacherProfile?.schoolId ?? this.requireTenant(tenant).id,
              teacherId: id,
              classId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.user.findUnique({
        where: { id },
        include: {
          teacherProfile: {
            include: {
              primarySubject: true,
              subjectLinks: { include: { subject: true } },
              classLinks: { include: { class: { include: { level: true } } } },
            },
          },
        },
      });
    });

    return this.mapTeacher(updated);
  }

  async deleteTeacher(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const teacher = await this.requireTeacher(client, id);
    await client.user.delete({ where: { id } });
    return this.mapTeacher(teacher);
  }

  async listStudents(tenant: ITenant | null, query: ListStudentsQueryDto = {}): Promise<any[]> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const academicYearId =
        query.academicYearId ?? (await this.getDefaultAcademicYearId(client, schoolId));
      const students = await client.user.findMany({
        where: {
          role: 'STUDENT',
          ...(academicYearId ? { studentProfile: { is: { academicYearId } } } : {}),
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
              parentUser: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return students.map((student: any) => this.mapStudent(student));
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
              class: true,
              parentUser: true,
            },
          },
        },
      });

      if (!student) {
        throw new NotFoundException('Eleve introuvable');
      }

      return this.mapStudent(student);
    });
  }

  async createStudent(tenant: ITenant | null, dto: CreateStudentDto): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const school = this.requireTenant(tenant);
      const schoolId = school.id;
      const { tempPassword, passwordHash } = await this.buildTempPassword();
      const academicYearId =
        dto.academicYearId ?? (await this.getDefaultAcademicYearId(client, schoolId));
      if (!academicYearId) {
        throw new BadRequestException('Aucune annee scolaire active n\'est disponible.');
      }
      await this.requireAcademicYear(client, schoolId, academicYearId);
      const schoolClass = await this.requireClass(client, schoolId, dto.classId);
      const email = dto.email.trim().toLowerCase();

      const existingEmail = await client.user.findFirst({
        where: {
          email,
        },
      });

      if (existingEmail) {
        throw new ConflictException('Un compte existe deja avec cet email.');
      }

      if (schoolClass.academicYearId && schoolClass.academicYearId !== academicYearId) {
        throw new BadRequestException(
          'La classe selectionnee n\'est pas rattachee a l\'annee scolaire active.',
        );
      }

      const created = await client.$transaction(async (tx: any) => {
        const classCapacityCount = await tx.studentProfile.count({
          where: {
            schoolId,
            classId: schoolClass.id,
          },
        });

        if (classCapacityCount >= schoolClass.capacity) {
          throw new BadRequestException('La classe selectionnee est complete.');
        }

        const academicYearName = await this.getAcademicYearName(tx, schoolId, academicYearId);
        const matricule = await this.generateStudentMatricule(tx, schoolId, academicYearName);
        const qrCode = buildStudentQrCode(school.slug, matricule);
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: dto.firstName.trim(),
            lastName: dto.name.trim(),
            role: 'STUDENT',
            phone: dto.phone?.trim() || null,
            isActive: dto.isActive ?? true,
            emailVerified: true,
            mustChangePassword: true,
          },
        });

        await tx.studentProfile.create({
          data: {
            schoolId,
            userId: user.id,
            academicYearId,
            classId: dto.classId,
            average: dto.average ?? 0,
            matricule,
            qrCode,
            enrollmentYear: dto.enrollmentYear ?? academicYearName,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            gender: dto.gender?.trim() || null,
            address: dto.address?.trim() || null,
            parentName: dto.parentName?.trim() || null,
            parentPhone: dto.parentPhone?.trim() || null,
          },
        });

        await refreshCompletedSemesterAverages(tx, schoolId);

        return tx.user.findUnique({
          where: { id: user.id },
          include: {
            studentProfile: {
              include: {
                academicYear: true,
                class: {
                  include: {
                    level: true,
                  },
                },
                parentUser: true,
              },
            },
          },
        });
      });

      this.sendUserInviteEmailAsync({
        tenant,
        email: dto.email,
        firstName: dto.firstName,
        accountLabel: 'eleve',
        tempPassword,
      }).catch((err) => {
        this.logger.warn(`Student email failed for ${dto.email}: ${err.message}`);
      });

      return this.mapStudent(created);
    });
  }

  async updateStudent(tenant: ITenant | null, id: string, dto: UpdateStudentDto): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const existing = await this.requireStudent(client, id);

      if (dto.classId !== undefined || dto.academicYearId !== undefined) {
        const resolvedAcademicYearId =
          dto.academicYearId ??
          existing.studentProfile?.academicYearId ??
          (await this.getDefaultAcademicYearId(client, schoolId));

        if (resolvedAcademicYearId) {
          await this.requireAcademicYear(client, schoolId, resolvedAcademicYearId);
        }

        const schoolClass =
          dto.classId !== undefined
            ? await this.requireClass(client, schoolId, dto.classId)
            : existing.studentProfile?.class;

        if (
          schoolClass?.academicYearId &&
          resolvedAcademicYearId &&
          schoolClass.academicYearId !== resolvedAcademicYearId
        ) {
          throw new BadRequestException(
            'La classe selectionnee n\'est pas rattachee a l\'annee scolaire choisie.',
          );
        }
      }

      const updated = await client.$transaction(async (tx: any) => {
        const user = await tx.user.update({
          where: { id },
          data: {
            ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
            ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
            ...(dto.name !== undefined ? { lastName: dto.name.trim() } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });

        await tx.studentProfile.update({
          where: { userId: id },
          data: {
            ...(dto.classId !== undefined ? { classId: dto.classId || null } : {}),
            ...(dto.academicYearId !== undefined
              ? { academicYearId: dto.academicYearId || null }
              : {}),
            ...(dto.average !== undefined ? { average: dto.average } : {}),
            ...(dto.enrollmentYear !== undefined
              ? { enrollmentYear: dto.enrollmentYear.trim() }
              : {}),
            ...(dto.dateOfBirth !== undefined
              ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }
              : {}),
            ...(dto.gender !== undefined ? { gender: dto.gender?.trim() || null } : {}),
            ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
            ...(dto.parentName !== undefined
              ? { parentName: dto.parentName?.trim() || null }
              : {}),
            ...(dto.parentPhone !== undefined
              ? { parentPhone: dto.parentPhone?.trim() || null }
              : {}),
          },
        });

        await refreshCompletedSemesterAverages(tx, schoolId);

        return tx.user.findUnique({
          where: { id },
          include: {
            studentProfile: {
              include: {
                academicYear: true,
                class: {
                  include: {
                    level: true,
                  },
                },
                parentUser: true,
              },
            },
          },
        });
      });

      return this.mapStudent(updated, existing);
    });
  }

  async deleteStudent(tenant: ITenant | null, id: string): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const student = await client.$transaction(async (tx: any) => {
        const existing = await this.requireStudent(tx, id);
        await tx.user.delete({ where: { id } });
        await refreshCompletedSemesterAverages(tx, schoolId);
        return existing;
      });
      return this.mapStudent(student);
    });
  }

  async toggleClassLeader(tenant: ITenant | null, id: string): Promise<any> {
    return withTenantSchemaRepair(tenant, this.tenantProvisioningService, async () => {
      const client = await this.getClient(tenant);
      
      const student = await client.studentProfile.findFirst({
        where: { userId: id }
      });

      if (!student) {
        throw new NotFoundException('Eleve introuvable');
      }

      const updated = await client.studentProfile.update({
        where: { id: student.id },
        data: { isClassLeader: !student.isClassLeader }
      });

      return {
        success: true,
        isClassLeader: updated.isClassLeader,
        message: updated.isClassLeader ? 'Eleve nomme delegue' : 'Status de delegue revoque'
      };
    });
  }

  async listParents(tenant: ITenant | null): Promise<any[]> {
    const client = await this.getClient(tenant);
    const parents = await client.user.findMany({
      where: { role: 'PARENT' },
      include: {
        parentProfile: {
          include: {
            primaryClass: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return parents.map((parent: any) => this.mapParent(parent));
  }

  async createParent(tenant: ITenant | null, dto: CreateParentDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const { tempPassword, passwordHash } = await this.buildTempPassword();
    if (dto.childClassId) {
      await this.requireClass(client, schoolId, dto.childClassId);
    }

    const created = await client.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.name.trim(),
          role: 'PARENT',
          phone: dto.phone?.trim() || null,
          isActive: dto.isActive ?? true,
          emailVerified: true,
          mustChangePassword: true,
        },
      });

      await tx.parentProfile.create({
        data: {
          schoolId,
          userId: user.id,
          childrenCount: dto.children ?? 1,
          primaryClassId: dto.childClassId ?? null,
          profession: dto.profession?.trim() || null,
        },
      });

      return tx.user.findUnique({
        where: { id: user.id },
        include: {
          parentProfile: {
            include: {
              primaryClass: true,
            },
          },
        },
      });
    });

    this.sendUserInviteEmailAsync({
      tenant,
      email: dto.email,
      firstName: dto.firstName,
      accountLabel: 'parent',
      tempPassword,
    }).catch((err) => {
      this.logger.warn(`Parent email failed for ${dto.email}: ${err.message}`);
    });

    return this.mapParent(created);
  }

  async updateParent(tenant: ITenant | null, id: string, dto: UpdateParentDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireParent(client, id);

    if (dto.childClassId !== undefined && dto.childClassId) {
      await this.requireClass(client, schoolId, dto.childClassId);
    }

    const updated = await client.$transaction(async (tx: any) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.name !== undefined ? { lastName: dto.name.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await tx.parentProfile.update({
        where: { userId: id },
        data: {
          ...(dto.children !== undefined ? { childrenCount: dto.children } : {}),
          ...(dto.childClassId !== undefined ? { primaryClassId: dto.childClassId || null } : {}),
          ...(dto.profession !== undefined ? { profession: dto.profession?.trim() || null } : {}),
        },
      });

      return tx.user.findUnique({
        where: { id },
        include: {
          parentProfile: {
            include: {
              primaryClass: true,
            },
          },
        },
      });
    });

    return this.mapParent(updated, existing);
  }

  async deleteParent(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const parent = await this.requireParent(client, id);
    await client.user.delete({ where: { id } });
    return this.mapParent(parent);
  }

  async listStaff(tenant: ITenant | null): Promise<any[]> {
    const client = await this.getClient(tenant);
    const staff = await client.staffMember.findMany({
      where: { schoolId: this.requireTenant(tenant).id },
      orderBy: { createdAt: 'desc' },
    });

    return staff.map((member: any) => this.mapStaff(member));
  }

  async createStaff(tenant: ITenant | null, dto: CreateStaffDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    this.requireStaffRole(dto.roleId);

    const created = await client.staffMember.create({
      data: {
        schoolId,
        firstName: dto.firstName.trim(),
        lastName: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        roleKey: dto.roleId,
        department: dto.department?.trim() || null,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
        isActive: dto.isActive ?? true,
      },
    });

    return this.mapStaff(created);
  }

  async updateStaff(tenant: ITenant | null, id: string, dto: UpdateStaffDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireStaff(client, schoolId, id);

    if (dto.roleId !== undefined) {
      this.requireStaffRole(dto.roleId);
    }

    const updated = await client.staffMember.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.name !== undefined ? { lastName: dto.name.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.roleId !== undefined ? { roleKey: dto.roleId } : {}),
        ...(dto.department !== undefined ? { department: dto.department?.trim() || null } : {}),
        ...(dto.hireDate !== undefined ? { hireDate: dto.hireDate ? new Date(dto.hireDate) : null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.mapStaff(updated, existing);
  }

  async deleteStaff(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireStaff(client, schoolId, id);
    await client.staffMember.delete({ where: { id } });
    return this.mapStaff(existing);
  }

  private async getClient(tenant: ITenant | null): Promise<any> {
    const resolvedTenant = this.requireTenant(tenant);
    return this.tenantDatabaseService.getClientForTenant(resolvedTenant);
  }

  private requireTenant(tenant: ITenant | null): ITenant {
    if (!tenant) {
      throw new BadRequestException('Le tenant de l\'ecole est requis pour gerer les utilisateurs.');
    }
    return tenant;
  }

  private async buildTempPassword(): Promise<{ tempPassword: string; passwordHash: string }> {
    const tempPassword =
      this.config.get<string>('TENANT_USER_TEMP_PASSWORD') ??
      this.config.get<string>('TENANT_ADMIN_TEMP_PASSWORD') ??
      DEFAULT_TEMP_PASSWORD;
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    return { tempPassword, passwordHash };
  }

  private async sendUserInviteEmailAsync(params: {
    tenant: ITenant | null;
    email: string;
    firstName?: string;
    accountLabel: string;
    tempPassword: string;
  }): Promise<void> {
    const school = this.requireTenant(params.tenant);
    const result = await this.emailService.sendUserInvitation({
      to: params.email,
      firstName: params.firstName,
      schoolName: school.name,
      tenantSlug: school.slug,
      login: params.email,
      password: params.tempPassword,
      accountLabel: params.accountLabel,
    });

    if (result.success) {
      this.logger.log(`Credentials email sent to ${params.email}`);
    }
  }

  private async requireTeacher(client: any, id: string): Promise<any> {
    const teacher = await client.user.findFirst({
      where: { id, role: 'TEACHER' },
      include: {
        teacherProfile: {
          include: {
            primarySubject: true,
            subjectLinks: { include: { subject: true } },
          },
        },
      },
    });

    if (!teacher) {
      throw new NotFoundException('Enseignant introuvable');
    }

    return teacher;
  }

  private async requireStudent(client: any, id: string): Promise<any> {
    const student = await client.user.findFirst({
      where: { id, role: 'STUDENT' },
      include: {
        studentProfile: {
          include: {
            academicYear: true,
            class: {
              include: {
                level: true,
              },
            },
            parentUser: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Eleve introuvable');
    }

    return student;
  }

  private async requireParent(client: any, id: string): Promise<any> {
    const parent = await client.user.findFirst({
      where: { id, role: 'PARENT' },
      include: {
        parentProfile: {
          include: {
            primaryClass: true,
          },
        },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent introuvable');
    }

    return parent;
  }

  private async requireStaff(client: any, schoolId: string, id: string): Promise<any> {
    const staff = await client.staffMember.findFirst({
      where: { id, schoolId },
    });

    if (!staff) {
      throw new NotFoundException('Membre du personnel introuvable');
    }

    return staff;
  }

  private requireClass(client: any, schoolId: string, id: string): Promise<any> {
    return client.schoolClass
      .findFirst({ where: { id, schoolId } })
      .then((schoolClass: any) => {
        if (!schoolClass) {
          throw new NotFoundException('Classe introuvable');
        }
        return schoolClass;
      });
  }

  private requireAcademicYear(client: any, schoolId: string, id: string): Promise<any> {
    return client.academicYear
      .findFirst({ where: { id, schoolId } })
      .then((year: any) => {
        if (!year) {
          throw new NotFoundException('Annee scolaire introuvable');
        }
        return year;
      });
  }

  private async requireClasses(client: any, schoolId: string, classIds: string[]): Promise<void> {
    if (!classIds.length) {
      return;
    }

    const classes = await client.schoolClass.findMany({
      where: {
        schoolId,
        id: { in: classIds },
      },
      select: { id: true },
    });

    if (classes.length !== classIds.length) {
      throw new BadRequestException('Certaines classes sont invalides.');
    }
  }

  private requireStaffRole(roleId: string): void {
    if (!Object.prototype.hasOwnProperty.call(StaffRoleValues, roleId)) {
      throw new BadRequestException('Role de personnel invalide');
    }
  }

  private async getDefaultAcademicYearId(client: any, schoolId: string): Promise<string | null> {
    const active = await client.academicYear.findFirst({
      where: { schoolId, status: 'active' },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });

    if (active) {
      return active.id;
    }

    const first = await client.academicYear.findFirst({
      where: { schoolId },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });

    return first?.id ?? null;
  }

  private async getAcademicYearName(client: any, schoolId: string, id: string): Promise<string> {
    const year = await client.academicYear.findFirst({ where: { id, schoolId } });
    return year?.name ?? new Date().getFullYear().toString();
  }

  private async nextSequence(
    client: any,
    schoolId: string,
    academicYearName: string,
    kind: string,
  ): Promise<number> {
    const academicYearSuffix = deriveAcademicYearSuffix(academicYearName);
    const existingMax = await this.getExistingSequenceMax(client, schoolId, academicYearSuffix, kind);
    const where = {
      schoolId_academicYearId_kind: {
        schoolId,
        academicYearId: academicYearSuffix,
        kind,
      },
    };

    const counter = await client.sequenceCounter.findUnique({ where });

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
    if (kind !== 'matricule') {
      return 0;
    }

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

    return records.reduce((max: number, record: { matricule: string | null }) => {
      if (!record.matricule) {
        return max;
      }

      const value = this.extractSequenceValue(record.matricule, [prefix]);
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

  private async generateStudentMatricule(
    client: any,
    schoolId: string,
    academicYearName: string,
  ): Promise<string> {
    const sequence = await this.nextSequence(client, schoolId, academicYearName, 'matricule');
    return formatSequenceCode('SCH', deriveAcademicYearSuffix(academicYearName), sequence);
  }

  private mapTeacher(teacher: any): any {
    const profile = teacher.teacherProfile;
    const subjectLinks = profile?.subjectLinks ?? [];
    const primarySubject = profile?.primarySubject ?? subjectLinks[0]?.subject;
    const classLinks = profile?.classLinks ?? [];
    const classNames = classLinks
      .map((link: any) => {
        const className = link.class?.name;
        if (!className) {
          return '';
        }
        const levelName = link.class?.level?.name;
        return levelName ? `${levelName} - ${className}` : className;
      })
      .filter(Boolean);

    return {
      id: teacher.id,
      firstName: teacher.firstName,
      name: teacher.lastName,
      email: teacher.email,
      phone: teacher.phone ?? '',
      subject: primarySubject?.name ?? '',
      subjectId:
        primarySubject?.id ?? profile?.primarySubjectId ?? subjectLinks[0]?.subjectId ?? '',
      classIds: classLinks.map((link: any) => link.classId),
      classNames,
      status: teacher.isActive ? 'active' : 'inactive',
    };
  }

  private mapStudent(student: any, fallback?: any): any {
    const profile = student.studentProfile ?? fallback?.studentProfile;
    const parentUser = profile?.parentUser ?? fallback?.studentProfile?.parentUser;
    const parentNameParts = (profile?.parentName ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return {
      id: student.id,
      firstName: student.firstName,
      name: student.lastName,
      email: student.email,
      phone: student.phone ?? '',
      classId: profile?.classId ?? '',
      class: profile?.class?.name ?? '',
      status: student.isActive ? 'active' : 'inactive',
      average: profile?.average ?? 0,
      enrollmentYear: profile?.enrollmentYear ?? '',
      matricule: profile?.matricule ?? '',
      qrCode: profile?.qrCode ?? '',
      levelId: profile?.class?.levelId ?? '',
      level: profile?.class?.level?.name ?? '',
      parentName:
        profile?.parentName ??
        (parentUser ? `${parentUser.firstName} ${parentUser.lastName}`.trim() : ''),
      parentFirstName: parentUser?.firstName ?? parentNameParts[0] ?? '',
      parentLastName: parentUser?.lastName ?? parentNameParts.slice(1).join(' ') ?? '',
      parentPhone: profile?.parentPhone ?? parentUser?.phone ?? '',
      parentUserId: profile?.parentUserId ?? '',
      academicYearId: profile?.academicYearId ?? '',
      dateOfBirth: profile?.dateOfBirth ? this.toDateOnly(profile.dateOfBirth) : '',
      gender: profile?.gender ?? '',
      address: profile?.address ?? '',
      previousSchool: profile?.previousSchool ?? '',
      isClassLeader: profile?.isClassLeader ?? false,
    };
  }

  private mapParent(parent: any, fallback?: any): any {
    const profile = parent.parentProfile ?? fallback?.parentProfile;
    return {
      id: parent.id,
      firstName: parent.firstName,
      name: parent.lastName,
      email: parent.email,
      phone: parent.phone ?? '',
      children: profile?.childrenCount ?? 0,
      childClassId: profile?.primaryClassId ?? '',
      childClass: profile?.primaryClass?.name ?? '',
      status: parent.isActive ? 'active' : 'inactive',
      profession: profile?.profession ?? '',
    };
  }

  private mapStaff(staff: any, fallback?: any): any {
    const record = staff ?? fallback;
    return {
      id: record.id,
      firstName: record.firstName,
      name: record.lastName,
      email: record.email,
      phone: record.phone ?? '',
      roleId: record.roleKey,
      role: STAFF_ROLE_LABELS[record.roleKey] ?? record.roleKey,
      department: record.department ?? '',
      status: record.isActive ? 'active' : 'inactive',
      hireDate: record.hireDate ? this.toDateOnly(record.hireDate) : '',
    };
  }

  private toDateOnly(value?: Date | string | null): string {
    if (!value) {
      return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString().slice(0, 10);
  }
}
