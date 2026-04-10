import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { ITenant } from '@common/interfaces/tenant.interface';

@Injectable()
export class SchoolProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentSchool(tenant: ITenant | null): Promise<any> {
    if (!tenant) {
      throw new NotFoundException('Le tenant de l’école est requis.');
    }

    const school = await this.prisma.school.findUnique({
      where: { id: tenant.id },
    });

    if (!school) {
      throw new NotFoundException('École introuvable.');
    }

    return {
      id: school.id,
      slug: school.slug,
      name: school.name,
      type: school.type,
      status: school.status,
      plan: school.plan,
      logo: school.logo ?? undefined,
      description: school.description ?? undefined,
      brandingColor: school.brandingColor ?? undefined,
      brandingSecondaryColor: school.brandingSecondaryColor ?? undefined,
      brandingSlogan: school.brandingSlogan ?? undefined,
      country: school.country ?? '',
      city: school.city ?? '',
      address: school.address ?? '',
      phone: school.phone ?? undefined,
      email: school.email,
      studentCount: 0,
      teacherCount: 0,
      adminEmail: school.email,
      createdAt: school.createdAt.toISOString(),
    };
  }
}
