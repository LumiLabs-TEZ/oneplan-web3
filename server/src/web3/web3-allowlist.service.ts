import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddWeb3AllowlistDto,
  Web3AllowlistEntryDto,
} from './dto/web3-allowlist.dto';

const ENTRY_SELECT = {
  userId: true,
  note: true,
  addedByEmail: true,
  createdAt: true,
  user: { select: { email: true, displayName: true } },
} as const;

type EntryRow = {
  userId: number;
  note: string | null;
  addedByEmail: string;
  createdAt: Date;
  user: { email: string; displayName: string };
};

function toDto(r: EntryRow): Web3AllowlistEntryDto {
  return {
    userId: r.userId,
    email: r.user.email,
    displayName: r.user.displayName,
    note: r.note,
    addedByEmail: r.addedByEmail,
    createdAt: r.createdAt.toISOString(),
  };
}

// Admin-managed web3 allowlist (see Web3EligibilityService.isEligible).
@Injectable()
export class Web3AllowlistService {
  private readonly logger = new Logger(Web3AllowlistService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Web3AllowlistEntryDto[]> {
    const rows = await this.prisma.web3Allowlist.findMany({
      orderBy: { createdAt: 'desc' },
      select: ENTRY_SELECT,
    });
    return rows.map(toDto);
  }

  // Idempotent: re-adding a listed user only updates the note.
  async add(
    dto: AddWeb3AllowlistDto,
    adminEmail: string,
  ): Promise<Web3AllowlistEntryDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(`No user found with email "${dto.email}".`);
    }
    const note = dto.note?.trim() || null;
    const row = await this.prisma.web3Allowlist.upsert({
      where: { userId: user.id },
      create: { userId: user.id, addedByEmail: adminEmail, note },
      update: { note },
      select: ENTRY_SELECT,
    });
    this.logger.log(`Web3 allowlist: ${adminEmail} added ${email}`);
    return toDto(row);
  }

  async remove(userId: number, adminEmail: string): Promise<void> {
    const { count } = await this.prisma.web3Allowlist.deleteMany({
      where: { userId },
    });
    if (count === 0) {
      throw new NotFoundException(`User ${userId} is not on the allowlist.`);
    }
    this.logger.log(`Web3 allowlist: ${adminEmail} removed user ${userId}`);
  }
}
