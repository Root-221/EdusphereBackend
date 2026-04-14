import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TimetableGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TimetableGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinSchool')
  handleJoinSchool(@MessageBody() schoolId: string, @ConnectedSocket() client: Socket) {
    if (schoolId) {
      client.join(schoolId);
      this.logger.debug(`Client ${client.id} joined room: ${schoolId}`);
    }
  }

  @SubscribeMessage('leaveSchool')
  handleLeaveSchool(@MessageBody() schoolId: string, @ConnectedSocket() client: Socket) {
    if (schoolId) {
      client.leave(schoolId);
      this.logger.debug(`Client ${client.id} left room: ${schoolId}`);
    }
  }

  /**
   * Broadcast an invalidation event for a school
   */
  notifyTimetableUpdate(schoolId: string) {
    this.logger.debug(`Emitting timetable:updated to room: ${schoolId}`);
    this.server.to(schoolId).emit('timetable:updated', { timestamp: Date.now() });
  }
}
