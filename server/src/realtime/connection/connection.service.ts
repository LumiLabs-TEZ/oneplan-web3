import { Injectable, Logger } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { JwtTokenService } from '../../auth/jwt.service';
import { REALTIME_EVENTS } from '../constants';
import { AuthenticatedSocketData } from './types';

@Injectable()
export class ConnectionService {
  private readonly logger = new Logger(ConnectionService.name);

  private clientAuth = new Map<WebSocket, AuthenticatedSocketData>();
  private tripRooms = new Map<number, Set<WebSocket>>();
  private userSockets = new Map<number, Set<WebSocket>>();

  constructor(private readonly jwtTokenService: JwtTokenService) {}

  // ── Authentication ───────────────────────────────────────────────

  authenticateClient(client: WebSocket, req: IncomingMessage): boolean {
    try {
      const token = this.extractToken(req);
      const payload = this.jwtTokenService.verifyAccessToken(token);
      const userId = payload.sub;

      this.clientAuth.set(client, {
        userId,
        email: payload.email,
      });

      let sockets = this.userSockets.get(userId);
      if (!sockets) {
        sockets = new Set<WebSocket>();
        this.userSockets.set(userId, sockets);
      }
      sockets.add(client);

      return true;
    } catch {
      this.sendEvent(client, REALTIME_EVENTS.ERROR, {
        message: 'Authentication failed',
      });
      client.close();
      return false;
    }
  }

  disconnectClient(client: WebSocket): void {
    const auth = this.clientAuth.get(client);
    if (auth) {
      const sockets = this.userSockets.get(auth.userId);
      if (sockets) {
        sockets.delete(client);
        if (sockets.size === 0) {
          this.userSockets.delete(auth.userId);
        }
      }
    }
    this.leaveAllRooms(client);
    this.clientAuth.delete(client);
  }

  getClientAuth(client: WebSocket): AuthenticatedSocketData | undefined {
    return this.clientAuth.get(client);
  }

  // ── Room Management ──────────────────────────────────────────────

  joinRoom(tripId: number, client: WebSocket): void {
    let room = this.tripRooms.get(tripId);
    if (!room) {
      room = new Set<WebSocket>();
      this.tripRooms.set(tripId, room);
    }
    room.add(client);
  }

  leaveRoom(tripId: number, client: WebSocket): void {
    const room = this.tripRooms.get(tripId);
    if (room) {
      room.delete(client);
      if (room.size === 0) {
        this.tripRooms.delete(tripId);
      }
    }
  }

  leaveAllRooms(client: WebSocket): void {
    for (const [tripId, room] of this.tripRooms) {
      room.delete(client);
      if (room.size === 0) {
        this.tripRooms.delete(tripId);
      }
    }
  }

  getOnlineUserIds(tripId: number): number[] {
    const room = this.tripRooms.get(tripId);
    if (!room) return [];
    return [...room]
      .map((client) => this.clientAuth.get(client)?.userId)
      .filter((id): id is number => id !== undefined);
  }

  filterOnlineUserIds(userIds: number[]): number[] {
    return userIds.filter((userId) => {
      const sockets = this.userSockets.get(userId);
      if (!sockets) return false;
      for (const client of sockets) {
        if (client.readyState === WebSocket.OPEN) return true;
      }
      return false;
    });
  }

  getRoomClients(tripId: number): Set<WebSocket> {
    return new Set(this.tripRooms.get(tripId) ?? []);
  }

  // ── Messaging ────────────────────────────────────────────────────

  sendToUser(userId: number, event: string, data: unknown): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    const message = JSON.stringify({ event, data });
    for (const client of sockets) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  sendToUsers(
    userIds: number[],
    event: string,
    data: unknown,
    excludedClients: Set<WebSocket> = new Set(),
  ): void {
    const message = JSON.stringify({ event, data });

    for (const userId of new Set(userIds)) {
      const sockets = this.userSockets.get(userId);
      if (!sockets) continue;

      for (const client of sockets) {
        if (excludedClients.has(client)) continue;
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    }
  }

  broadcastToRoom(tripId: number, event: string, data: unknown): void {
    const room = this.tripRooms.get(tripId);
    // An empty room is silence, and silence looked identical to a broken
    // client. Saying how many heard it separates "nobody was listening" from
    // "somebody was and ignored it".
    this.logger.debug(
      `broadcast ${event} to trip ${Number(tripId)}: ${room?.size ?? 0} listener(s)`,
    );
    if (!room) return;
    const message = JSON.stringify({ event, data });
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  sendEvent(client: WebSocket, event: string, data: unknown): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event, data }));
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private extractToken(req: IncomingMessage): string {
    // Tokens MUST arrive via the Authorization header. Query-string transport
    // was removed (it leaked tokens into proxy/CDN logs and crash dumps).
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice(7);
    }

    throw new Error('No token provided');
  }
}
