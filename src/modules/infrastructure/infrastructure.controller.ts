import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentTenant } from '@common/decorators/current-tenant.decorator';
import { ITenant } from '@common/interfaces/tenant.interface';
import { UserRole } from '@prisma/client';
import { InfrastructureService } from './infrastructure.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { ListBuildingsQueryDto } from './dto/list-buildings-query.dto';
import { ListRoomsQueryDto } from './dto/list-rooms-query.dto';
import { BuildingStatusEnum, RoomStatusEnum, RoomTypeEnum } from './infrastructure.types';

@ApiTags('Infrastructure')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Slug',
  required: false,
  description: 'Slug du tenant. Il est déduit automatiquement du sous-domaine si absent.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SCHOOL_ADMIN)
@Controller('school-admin/infrastructure')
export class InfrastructureController {
  constructor(private readonly infrastructureService: InfrastructureService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques globales de l infrastructure' })
  @ApiOkResponse({ description: 'Statistiques récupérées avec succès' })
  async stats(@CurrentTenant() tenant: ITenant | null, @Req() req: Request) {
    const data = await this.infrastructureService.getStats(tenant);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Get('buildings')
  @ApiOperation({ summary: 'Lister les bâtiments' })
  @ApiQuery({ name: 'search', required: false, description: 'Recherche par nom ou description' })
  @ApiQuery({ name: 'status', required: false, enum: BuildingStatusEnum, description: 'Filtre par statut' })
  @ApiOkResponse({ description: 'Liste des bâtiments' })
  async listBuildings(
    @CurrentTenant() tenant: ITenant | null,
    @Query() query: ListBuildingsQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.listBuildings(tenant, query);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Post('buildings')
  @ApiOperation({ summary: 'Créer un bâtiment' })
  @ApiBody({ type: CreateBuildingDto })
  @ApiCreatedResponse({ description: 'Bâtiment créé avec succès' })
  async createBuilding(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateBuildingDto,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.createBuilding(tenant, dto);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Get('buildings/:id')
  @ApiOperation({ summary: 'Consulter un bâtiment' })
  @ApiParam({ name: 'id', description: 'Identifiant du bâtiment' })
  @ApiOkResponse({ description: 'Détails du bâtiment' })
  async getBuilding(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.getBuildingById(tenant, id);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Patch('buildings/:id')
  @ApiOperation({ summary: 'Mettre à jour un bâtiment' })
  @ApiParam({ name: 'id', description: 'Identifiant du bâtiment' })
  @ApiBody({ type: UpdateBuildingDto })
  @ApiOkResponse({ description: 'Bâtiment mis à jour' })
  async updateBuilding(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.updateBuilding(tenant, id, dto);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Delete('buildings/:id')
  @ApiOperation({ summary: 'Supprimer un bâtiment' })
  @ApiParam({ name: 'id', description: 'Identifiant du bâtiment' })
  @ApiOkResponse({ description: 'Bâtiment supprimé' })
  async deleteBuilding(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.deleteBuilding(tenant, id);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Get('buildings/:id/rooms')
  @ApiOperation({ summary: 'Lister les salles d un bâtiment' })
  @ApiParam({ name: 'id', description: 'Identifiant du bâtiment' })
  @ApiOkResponse({ description: 'Salles du bâtiment' })
  async listBuildingRooms(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.listRooms(tenant, { buildingId: id });
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Get('rooms')
  @ApiOperation({ summary: 'Lister les salles' })
  @ApiQuery({ name: 'search', required: false, description: 'Recherche par nom, description, équipement ou bâtiment' })
  @ApiQuery({ name: 'buildingId', required: false, description: 'Filtrer sur un bâtiment' })
  @ApiQuery({ name: 'status', required: false, enum: RoomStatusEnum, description: 'Filtre par statut' })
  @ApiQuery({ name: 'roomType', required: false, enum: RoomTypeEnum, description: 'Filtre par type de salle' })
  @ApiQuery({ name: 'floor', required: false, type: Number, description: 'Filtre par étage' })
  @ApiOkResponse({ description: 'Liste des salles' })
  async listRooms(
    @CurrentTenant() tenant: ITenant | null,
    @Query() query: ListRoomsQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.listRooms(tenant, query);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Créer une salle' })
  @ApiBody({ type: CreateRoomDto })
  @ApiCreatedResponse({ description: 'Salle créée avec succès' })
  async createRoom(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateRoomDto,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.createRoom(tenant, dto);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: 'Consulter une salle' })
  @ApiParam({ name: 'id', description: 'Identifiant de la salle' })
  @ApiOkResponse({ description: 'Détails de la salle' })
  async getRoom(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.getRoomById(tenant, id);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Patch('rooms/:id')
  @ApiOperation({ summary: 'Mettre à jour une salle' })
  @ApiParam({ name: 'id', description: 'Identifiant de la salle' })
  @ApiBody({ type: UpdateRoomDto })
  @ApiOkResponse({ description: 'Salle mise à jour' })
  async updateRoom(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.updateRoom(tenant, id, dto);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Delete('rooms/:id')
  @ApiOperation({ summary: 'Supprimer une salle' })
  @ApiParam({ name: 'id', description: 'Identifiant de la salle' })
  @ApiOkResponse({ description: 'Salle supprimée' })
  async deleteRoom(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.deleteRoom(tenant, id);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Get('hierarchy')
  @ApiOperation({ summary: 'Vue hiérarchique des bâtiments et salles' })
  @ApiQuery({ name: 'search', required: false, description: 'Recherche par nom ou description' })
  @ApiQuery({ name: 'buildingId', required: false, description: 'Filtrer sur un bâtiment' })
  @ApiQuery({ name: 'status', required: false, enum: RoomStatusEnum, description: 'Filtre par statut' })
  @ApiQuery({ name: 'roomType', required: false, enum: RoomTypeEnum, description: 'Filtre par type de salle' })
  @ApiQuery({ name: 'floor', required: false, type: Number, description: 'Filtre par étage' })
  @ApiOkResponse({ description: 'Hiérarchie récupérée avec succès' })
  async hierarchy(
    @CurrentTenant() tenant: ITenant | null,
    @Query() query: ListRoomsQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.infrastructureService.getHierarchy(tenant, query);
    return {
      data,
      _links: {
        self: req.originalUrl,
      },
    };
  }
}
