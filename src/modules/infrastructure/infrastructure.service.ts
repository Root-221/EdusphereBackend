import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { TenantProvisioningService } from '@database/tenant-provisioning.service';
import { ITenant } from '@common/interfaces/tenant.interface';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { ListBuildingsQueryDto } from './dto/list-buildings-query.dto';
import { ListRoomsQueryDto } from './dto/list-rooms-query.dto';
import {
  BuildingStatus,
  BuildingStatusEnum,
  RoomStatus,
  RoomStatusEnum,
  RoomType,
} from './infrastructure.types';

type RawPrismaClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
};

interface BuildingRow {
  id: string;
  schoolId: string;
  name: string;
  description: string | null;
  floorCount: number;
  status: BuildingStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface RoomMetricsRow {
  buildingId: string;
  status: RoomStatus;
  capacity: number;
  roomType: RoomType;
}

interface RoomRowWithBuilding {
  id: string;
  schoolId: string;
  buildingId: string;
  name: string;
  floor: number;
  capacity: number;
  roomType: RoomType;
  status: RoomStatus;
  description: string | null;
  equipment: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  buildingName: string;
  buildingFloorCount: number;
  buildingStatus: BuildingStatus;
}

export interface BuildingSummary {
  id: string;
  schoolId: string;
  name: string;
  description?: string | null;
  floorCount: number;
  status: BuildingStatus;
  roomCount: number;
  activeRoomCount: number;
  maintenanceRoomCount: number;
  inactiveRoomCount: number;
  totalCapacity: number;
  occupancyRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomSummary {
  id: string;
  schoolId: string;
  buildingId: string;
  buildingName: string;
  building?: {
    id: string;
    name: string;
    floorCount: number;
    status: BuildingStatus;
  };
  name: string;
  floor: number;
  capacity: number;
  roomType: RoomType;
  status: RoomStatus;
  description?: string | null;
  equipment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingHierarchyItem extends BuildingSummary {
  rooms: RoomSummary[];
}

export interface InfrastructureStats {
  totalBuildings: number;
  totalRooms: number;
  activeRooms: number;
  maintenanceRooms: number;
  inactiveRooms: number;
  totalCapacity: number;
  occupancyRate: number;
}

@Injectable()
export class InfrastructureService {
  constructor(
    private readonly tenantDatabaseService: TenantDatabaseService,
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  private async withSchemaRepair<T>(
    tenant: ITenant | null,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!tenant || !this.isSchemaMismatchError(error)) {
        throw error;
      }

      await this.tenantProvisioningService.syncTenantSchema(tenant.databaseUrl, tenant.slug);
      return operation();
    }
  }

  private isSchemaMismatchError(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error) || typeof (error as { code?: unknown }).code !== 'string') {
      return false;
    }

    const code = (error as { code?: string }).code;

    if (code === 'P2021' || code === 'P2022') {
      return true;
    }

    if (code === 'P2010') {
      const meta = (error as { meta?: { code?: unknown; message?: unknown } }).meta;
      const dbCode = typeof meta?.code === 'string' ? meta.code : '';
      const message = typeof meta?.message === 'string' ? meta.message : '';
      return dbCode === '42P01' || /relation .* does not exist/i.test(message) || /table .* does not exist/i.test(message);
    }

    return false;
  }

  async getStats(tenant: ITenant | null): Promise<InfrastructureStats> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;

      const [buildingRows, roomRows] = await Promise.all([
        client.$queryRaw<Array<{ total: number | bigint }>>(Prisma.sql`
          SELECT COUNT(*)::int AS total
          FROM "Building"
          WHERE "schoolId" = ${schoolId}
        `),
        client.$queryRaw<Pick<RoomMetricsRow, 'status' | 'capacity'>[]>(Prisma.sql`
          SELECT status, capacity
          FROM "Room"
          WHERE "schoolId" = ${schoolId}
        `),
      ]);

      const totalBuildings = Number(buildingRows[0]?.total ?? 0);
      const totalRooms = roomRows.length;
      const activeRooms = roomRows.filter((room) => room.status === RoomStatusEnum.active).length;
      const maintenanceRooms = roomRows.filter((room) => room.status === RoomStatusEnum.maintenance).length;
      const inactiveRooms = roomRows.filter((room) => room.status === RoomStatusEnum.inactive).length;
      const totalCapacity = roomRows.reduce((sum, room) => sum + Number(room.capacity ?? 0), 0);

      return {
        totalBuildings,
        totalRooms,
        activeRooms,
        maintenanceRooms,
        inactiveRooms,
        totalCapacity,
        occupancyRate: totalRooms > 0 ? Math.round((activeRooms / totalRooms) * 100) : 0,
      };
    });
  }

  async listBuildings(tenant: ITenant | null, query: ListBuildingsQueryDto): Promise<BuildingSummary[]> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;

      const where = this.buildBuildingWhereClause(schoolId, query);
      const [buildings, roomMetrics] = await Promise.all([
        client.$queryRaw<BuildingRow[]>(Prisma.sql`
          SELECT
            b."id",
            b."schoolId",
            b."name",
            b."description",
            b."floorCount",
            b."status",
            b."createdAt",
            b."updatedAt"
          FROM "Building" b
          ${where}
          ORDER BY b."createdAt" DESC
        `),
        client.$queryRaw<RoomMetricsRow[]>(Prisma.sql`
          SELECT
            r."buildingId",
            r.status,
            r.capacity,
            r."roomType"
          FROM "Room" r
          WHERE r."schoolId" = ${schoolId}
        `),
      ]);

      const metricsByBuilding = this.groupRoomMetricsByBuilding(roomMetrics);
      return buildings.map((building) =>
        this.mapBuildingSummary(building, metricsByBuilding.get(building.id) ?? []),
      );
    });
  }

  async getBuildingById(tenant: ITenant | null, id: string): Promise<BuildingHierarchyItem> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const building = await this.getBuildingRowById(client, schoolId, id);

      if (!building) {
        throw new NotFoundException('Bâtiment introuvable');
      }

      const rooms = await this.getRoomRowsForBuilding(client, schoolId, id);
      const summary = this.mapBuildingSummary(building, rooms);

      return {
        ...summary,
        rooms: rooms.map((room) => this.mapRoomSummary(room)),
      };
    });
  }

  async createBuilding(tenant: ITenant | null, dto: CreateBuildingDto): Promise<BuildingSummary> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const id = randomUUID();

      await client.$executeRaw(Prisma.sql`
        INSERT INTO "Building" (
          "id",
          "schoolId",
          "name",
          "description",
          "floorCount",
          "status",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${id},
          ${schoolId},
          ${dto.name.trim()},
          ${dto.description?.trim() || null},
          ${dto.floorCount ?? 1},
          ${dto.status ?? BuildingStatusEnum.active}::"BuildingStatus",
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `);

      const building = await this.getBuildingRowById(client, schoolId, id);
      if (!building) {
        throw new NotFoundException('Bâtiment introuvable');
      }

      return this.mapBuildingSummary(building, []);
    });
  }

  async updateBuilding(tenant: ITenant | null, id: string, dto: UpdateBuildingDto): Promise<BuildingSummary> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const existing = await this.getBuildingRowById(client, schoolId, id);

      if (!existing) {
        throw new NotFoundException('Bâtiment introuvable');
      }

      const updates: Prisma.Sql[] = [];
      if (dto.name !== undefined) {
        updates.push(Prisma.sql`"name" = ${dto.name.trim()}`);
      }
      if (dto.description !== undefined) {
        updates.push(Prisma.sql`"description" = ${dto.description?.trim() || null}`);
      }
      if (dto.floorCount !== undefined) {
        updates.push(Prisma.sql`"floorCount" = ${dto.floorCount}`);
      }
      if (dto.status !== undefined) {
        updates.push(Prisma.sql`"status" = ${dto.status}::"BuildingStatus"`);
      }
      updates.push(Prisma.sql`"updatedAt" = CURRENT_TIMESTAMP`);

      await client.$executeRaw(Prisma.sql`
        UPDATE "Building"
        SET ${Prisma.join(updates)}
        WHERE "id" = ${id} AND "schoolId" = ${schoolId}
      `);

      const updated = await this.getBuildingRowById(client, schoolId, id);
      if (!updated) {
        throw new NotFoundException('Bâtiment introuvable');
      }

      const rooms = await this.getRoomRowsForBuilding(client, schoolId, id);
      return this.mapBuildingSummary(updated, rooms);
    });
  }

  async deleteBuilding(tenant: ITenant | null, id: string): Promise<BuildingSummary> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const existing = await this.getBuildingRowById(client, schoolId, id);

      if (!existing) {
        throw new NotFoundException('Bâtiment introuvable');
      }

      const rooms = await this.getRoomRowsForBuilding(client, schoolId, id);
      await client.$executeRaw(Prisma.sql`
        DELETE FROM "Building"
        WHERE "id" = ${id} AND "schoolId" = ${schoolId}
      `);

      return this.mapBuildingSummary(existing, rooms);
    });
  }

  async listRooms(tenant: ITenant | null, query: ListRoomsQueryDto): Promise<RoomSummary[]> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;

      const conditions: Prisma.Sql[] = [Prisma.sql`r."schoolId" = ${schoolId}`];

      if (query.buildingId) {
        conditions.push(Prisma.sql`r."buildingId" = ${query.buildingId}`);
      }
      if (query.status) {
        conditions.push(Prisma.sql`r.status = ${query.status}::"RoomStatus"`);
      }
      if (query.roomType) {
        conditions.push(Prisma.sql`r."roomType" = ${query.roomType}::"RoomType"`);
      }
      if (query.floor !== undefined) {
        conditions.push(Prisma.sql`r.floor = ${query.floor}`);
      }
      if (query.search?.trim()) {
        const search = `%${query.search.trim()}%`;
        conditions.push(Prisma.sql`
          (
            r."name" ILIKE ${search}
            OR COALESCE(r."description", '') ILIKE ${search}
            OR COALESCE(r."equipment", '') ILIKE ${search}
            OR b."name" ILIKE ${search}
          )
        `);
      }

      const rows = await client.$queryRaw<RoomRowWithBuilding[]>(Prisma.sql`
        SELECT
          r."id",
          r."schoolId",
          r."buildingId",
          r."name",
          r."floor",
          r."capacity",
          r."roomType",
          r."status",
          r."description",
          r."equipment",
          r."createdAt",
          r."updatedAt",
          b."name" AS "buildingName",
          b."floorCount" AS "buildingFloorCount",
          b."status" AS "buildingStatus"
        FROM "Room" r
        JOIN "Building" b ON b."id" = r."buildingId"
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY r."createdAt" DESC
      `);

      return rows.map((room) => this.mapRoomSummary(room));
    });
  }

  async getRoomById(tenant: ITenant | null, id: string): Promise<RoomSummary> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const room = await this.getRoomRowById(client, schoolId, id);

      if (!room) {
        throw new NotFoundException('Salle introuvable');
      }

      return this.mapRoomSummary(room);
    });
  }

  async createRoom(tenant: ITenant | null, dto: CreateRoomDto): Promise<RoomSummary> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const building = await this.getBuildingRowById(client, schoolId, dto.buildingId);

      if (!building) {
        throw new NotFoundException('Bâtiment introuvable');
      }

      const floor = dto.floor ?? 0;
      this.assertFloorIsValid(floor, building.floorCount);

      const id = randomUUID();
      await client.$executeRaw(Prisma.sql`
        INSERT INTO "Room" (
          "id",
          "schoolId",
          "buildingId",
          "name",
          "floor",
          "capacity",
          "roomType",
          "status",
          "description",
          "equipment",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${id},
          ${schoolId},
          ${building.id},
          ${dto.name.trim()},
          ${floor},
          ${dto.capacity ?? 30},
          ${dto.roomType}::"RoomType",
          ${dto.status ?? RoomStatusEnum.active}::"RoomStatus",
          ${dto.description?.trim() || null},
          ${dto.equipment?.trim() || null},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `);

      const room = await this.getRoomRowById(client, schoolId, id);
      if (!room) {
        throw new NotFoundException('Salle introuvable');
      }

      return this.mapRoomSummary(room);
    });
  }

  async updateRoom(tenant: ITenant | null, id: string, dto: UpdateRoomDto): Promise<RoomSummary> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const existingRoom = await this.getRoomRowById(client, schoolId, id);

      if (!existingRoom) {
        throw new NotFoundException('Salle introuvable');
      }

      const targetBuildingId = dto.buildingId ?? existingRoom.buildingId;
      const targetFloor = dto.floor ?? existingRoom.floor;
      const targetBuilding = await this.getBuildingRowById(client, schoolId, targetBuildingId);

      if (!targetBuilding) {
        throw new NotFoundException('Bâtiment introuvable');
      }

      this.assertFloorIsValid(targetFloor, targetBuilding.floorCount);

      const updates: Prisma.Sql[] = [];
      if (dto.name !== undefined) {
        updates.push(Prisma.sql`"name" = ${dto.name.trim()}`);
      }
      if (dto.buildingId !== undefined) {
        updates.push(Prisma.sql`"buildingId" = ${targetBuildingId}`);
      }
      if (dto.floor !== undefined) {
        updates.push(Prisma.sql`"floor" = ${dto.floor}`);
      }
      if (dto.capacity !== undefined) {
        updates.push(Prisma.sql`"capacity" = ${dto.capacity}`);
      }
      if (dto.roomType !== undefined) {
        updates.push(Prisma.sql`"roomType" = ${dto.roomType}::"RoomType"`);
      }
      if (dto.status !== undefined) {
        updates.push(Prisma.sql`"status" = ${dto.status}::"RoomStatus"`);
      }
      if (dto.description !== undefined) {
        updates.push(Prisma.sql`"description" = ${dto.description?.trim() || null}`);
      }
      if (dto.equipment !== undefined) {
        updates.push(Prisma.sql`"equipment" = ${dto.equipment?.trim() || null}`);
      }
      updates.push(Prisma.sql`"updatedAt" = CURRENT_TIMESTAMP`);

      await client.$executeRaw(Prisma.sql`
        UPDATE "Room"
        SET ${Prisma.join(updates)}
        WHERE "id" = ${id} AND "schoolId" = ${schoolId}
      `);

      const room = await this.getRoomRowById(client, schoolId, id);
      if (!room) {
        throw new NotFoundException('Salle introuvable');
      }

      return this.mapRoomSummary(room);
    });
  }

  async deleteRoom(tenant: ITenant | null, id: string): Promise<RoomSummary> {
    return this.withSchemaRepair(tenant, async () => {
      const client = await this.getTenantClient(tenant);
      const schoolId = this.requireTenant(tenant).id;
      const room = await this.getRoomRowById(client, schoolId, id);

      if (!room) {
        throw new NotFoundException('Salle introuvable');
      }

      await client.$executeRaw(Prisma.sql`
        DELETE FROM "Room"
        WHERE "id" = ${id} AND "schoolId" = ${schoolId}
      `);

      return this.mapRoomSummary(room);
    });
  }

  async getHierarchy(tenant: ITenant | null, query: ListRoomsQueryDto): Promise<BuildingHierarchyItem[]> {
    return this.withSchemaRepair(tenant, async () => {
      const buildings = await this.listBuildings(tenant, {
        search: query.search,
        status: query.status,
      });
      const rooms = await this.listRooms(tenant, query);

      return buildings.map((building) => ({
        ...building,
        rooms: rooms.filter((room) => room.buildingId === building.id),
      }));
    });
  }

  private async getTenantClient(tenant: ITenant | null): Promise<RawPrismaClient> {
    const resolvedTenant = this.requireTenant(tenant);
    return this.tenantDatabaseService.getClientForTenant(resolvedTenant) as unknown as Promise<RawPrismaClient>;
  }

  private requireTenant(tenant: ITenant | null): ITenant {
    if (!tenant) {
      throw new BadRequestException('Le tenant de l’école est requis pour accéder à l’infrastructure.');
    }
    return tenant;
  }

  private buildBuildingWhereClause(schoolId: string, query: ListBuildingsQueryDto): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`b."schoolId" = ${schoolId}`];

    if (query.status) {
      conditions.push(Prisma.sql`b.status = ${query.status}::"BuildingStatus"`);
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      conditions.push(Prisma.sql`
        (
          b."name" ILIKE ${search}
          OR COALESCE(b."description", '') ILIKE ${search}
        )
      `);
    }

    return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  private async getBuildingRowById(
    client: RawPrismaClient,
    schoolId: string,
    id: string,
  ): Promise<BuildingRow | null> {
    const rows = await client.$queryRaw<BuildingRow[]>(Prisma.sql`
      SELECT
        b."id",
        b."schoolId",
        b."name",
        b."description",
        b."floorCount",
        b."status",
        b."createdAt",
        b."updatedAt"
      FROM "Building" b
      WHERE b."schoolId" = ${schoolId} AND b."id" = ${id}
      LIMIT 1
    `);

    return rows[0] ?? null;
  }

  private async getRoomRowById(
    client: RawPrismaClient,
    schoolId: string,
    id: string,
  ): Promise<RoomRowWithBuilding | null> {
    const rows = await client.$queryRaw<RoomRowWithBuilding[]>(Prisma.sql`
      SELECT
        r."id",
        r."schoolId",
        r."buildingId",
        r."name",
        r."floor",
        r."capacity",
        r."roomType",
        r."status",
        r."description",
        r."equipment",
        r."createdAt",
        r."updatedAt",
        b."name" AS "buildingName",
        b."floorCount" AS "buildingFloorCount",
        b."status" AS "buildingStatus"
      FROM "Room" r
      JOIN "Building" b ON b."id" = r."buildingId"
      WHERE r."schoolId" = ${schoolId} AND r."id" = ${id}
      LIMIT 1
    `);

    return rows[0] ?? null;
  }

  private async getRoomRowsForBuilding(
    client: RawPrismaClient,
    schoolId: string,
    buildingId: string,
  ): Promise<RoomRowWithBuilding[]> {
    return client.$queryRaw<RoomRowWithBuilding[]>(Prisma.sql`
      SELECT
        r."id",
        r."schoolId",
        r."buildingId",
        r."name",
        r."floor",
        r."capacity",
        r."roomType",
        r."status",
        r."description",
        r."equipment",
        r."createdAt",
        r."updatedAt",
        b."name" AS "buildingName",
        b."floorCount" AS "buildingFloorCount",
        b."status" AS "buildingStatus"
      FROM "Room" r
      JOIN "Building" b ON b."id" = r."buildingId"
      WHERE r."schoolId" = ${schoolId} AND r."buildingId" = ${buildingId}
      ORDER BY r."createdAt" DESC
    `);
  }

  private groupRoomMetricsByBuilding(roomMetrics: RoomMetricsRow[]): Map<string, RoomMetricsRow[]> {
    const map = new Map<string, RoomMetricsRow[]>();
    for (const room of roomMetrics) {
      const current = map.get(room.buildingId) ?? [];
      current.push(room);
      map.set(room.buildingId, current);
    }
    return map;
  }

  private mapBuildingSummary(
    building: BuildingRow,
    rooms: Array<Pick<RoomMetricsRow, 'status' | 'capacity' | 'roomType'>>,
  ): BuildingSummary {
    const roomCount = rooms.length;
    const activeRoomCount = rooms.filter((room) => room.status === RoomStatusEnum.active).length;
    const maintenanceRoomCount = rooms.filter((room) => room.status === RoomStatusEnum.maintenance).length;
    const inactiveRoomCount = rooms.filter((room) => room.status === RoomStatusEnum.inactive).length;
    const totalCapacity = rooms.reduce((sum, room) => sum + Number(room.capacity ?? 0), 0);

    return {
      id: building.id,
      schoolId: building.schoolId,
      name: building.name,
      description: building.description,
      floorCount: building.floorCount,
      status: building.status,
      roomCount,
      activeRoomCount,
      maintenanceRoomCount,
      inactiveRoomCount,
      totalCapacity,
      occupancyRate: roomCount > 0 ? Math.round((activeRoomCount / roomCount) * 100) : 0,
      createdAt: this.toIso(building.createdAt),
      updatedAt: this.toIso(building.updatedAt),
    };
  }

  private mapRoomSummary(room: RoomRowWithBuilding): RoomSummary {
    return {
      id: room.id,
      schoolId: room.schoolId,
      buildingId: room.buildingId,
      buildingName: room.buildingName,
      building: {
        id: room.buildingId,
        name: room.buildingName,
        floorCount: room.buildingFloorCount,
        status: room.buildingStatus,
      },
      name: room.name,
      floor: room.floor,
      capacity: room.capacity,
      roomType: room.roomType,
      status: room.status,
      description: room.description,
      equipment: room.equipment,
      createdAt: this.toIso(room.createdAt),
      updatedAt: this.toIso(room.updatedAt),
    };
  }

  private assertFloorIsValid(floor: number, floorCount: number) {
    if (floor > floorCount) {
      throw new BadRequestException(
        `L étage ${floor} n existe pas pour ce bâtiment (maximum ${floorCount}).`,
      );
    }
  }

  private toIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}
