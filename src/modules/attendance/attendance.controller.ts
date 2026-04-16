import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, ManualAttendanceDto, JustifyAttendanceDto } from './dto/attendance.dto';

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @ApiOperation({ summary: 'Générer un QR token pour l\'élève' })
  @Roles('STUDENT')
  @Get('qr-token')
  async getMyQrToken(@Req() req: any) {
    return this.attendanceService.generateQrToken(req.user.studentProfileId || req.user.id);
  }

  @ApiOperation({ summary: 'Marquer une présence par scan QR' })
  @Roles('TEACHER', 'STUDENT', 'SCHOOL_ADMIN') // Le rôle STUDENT est restreint au délégué dans le service
  @Post('mark')
  async markPresence(@Req() req: any, @Body() dto: MarkAttendanceDto) {
    return this.attendanceService.markAttendance(
      req.school,
      req.user.id,
      req.user.role,
      dto
    );
  }

  @ApiOperation({ summary: 'Marquer une présence manuellement par matricule' })
  @Roles('TEACHER', 'STUDENT', 'SCHOOL_ADMIN')
  @Post('mark-manual')
  async markManual(@Req() req: any, @Body() dto: ManualAttendanceDto) {
    return this.attendanceService.markManualAttendance(
      req.school,
      req.user.id,
      req.user.role,
      dto
    );
  }

  @ApiOperation({ summary: 'Liste d\'assiduité pour une instance de cours' })
  @Roles('TEACHER', 'STUDENT', 'SCHOOL_ADMIN')
  @Get('course/:instanceId')
  async getCourseAttendance(
    @Req() req: any,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Param('instanceId') instanceId: string,
  ) {
    return this.attendanceService.getCourseAttendanceList(
      req.school,
      userId,
      userRole,
      instanceId,
    );
  }

  @ApiOperation({ summary: 'Justifier l\'absence d\'un élève' })
  @Roles('TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
  @Post('course/:instanceId/students/:studentId/justify')
  async justifyAttendance(
    @Req() req: any,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Param('instanceId') instanceId: string,
    @Param('studentId') studentId: string,
    @Body() dto: JustifyAttendanceDto,
  ) {
    return this.attendanceService.justifyAttendance(
      req.school,
      userId,
      userRole,
      instanceId,
      studentId,
      dto.reason,
    );
  }

}
