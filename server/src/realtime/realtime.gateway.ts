import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import { Server, WebSocket } from 'ws';
import { ConnectionService } from './connection/connection.service';
import { ChatHandler } from './handlers/chat.handler';

@WebSocketGateway({ path: '/realtime' })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly chatHandler: ChatHandler,
  ) {}

  private readonly lifecycleLogger = new Logger('RealtimeLifecycle');

  handleConnection(client: WebSocket, req: IncomingMessage): void {
    this.lifecycleLogger.debug('client connected');
    this.connectionService.authenticateClient(client, req);
  }

  handleDisconnect(client: WebSocket): void {
    this.lifecycleLogger.debug('client disconnected');
    this.connectionService.disconnectClient(client);
  }

  @SubscribeMessage('joinTrip')
  async handleJoinTrip(
    client: WebSocket,
    data: { tripId: number },
  ): Promise<void> {
    // tripId is client-supplied: log it as a number, never the raw value.
    this.lifecycleLogger.debug(`client joining trip ${Number(data?.tripId)}`);
    return this.chatHandler.handleJoinTrip(client, data);
  }

  @SubscribeMessage('leaveTrip')
  handleLeaveTrip(client: WebSocket, data: { tripId: number }): void {
    return this.chatHandler.handleLeaveTrip(client, data);
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    client: WebSocket,
    data: Record<string, unknown> | undefined,
  ): Promise<void> {
    return this.chatHandler.handleSendMessage(client, data);
  }
}
