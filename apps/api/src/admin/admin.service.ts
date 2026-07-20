import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { prisma } from "@mfd/db";
import { CreateDistributorDto } from "./dto/create-distributor.dto";
import { CreateChildArnProfileDto } from "./dto/create-child-arn-profile.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AdminService {
  async createDistributor(dto: CreateDistributorDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const inboundMailDomain = process.env.INBOUND_MAIL_DOMAIN ?? "platform.example.com";

    const distributor = await prisma.distributor.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash,
        inboundEmailAlias: `inbound-ingest-${randomUUID()}@${inboundMailDomain}`,
        arnProfiles: {
          create: { ...dto.arnProfile },
        },
      },
      include: { arnProfiles: true },
    });

    const { passwordHash: _passwordHash, ...safeDistributor } = distributor;
    return safeDistributor;
  }

  addChildArnProfile(distributorId: string, dto: CreateChildArnProfileDto) {
    const { parentArnProfileId, ...arnFields } = dto;
    return prisma.arnProfile.create({
      data: {
        ...arnFields,
        distributorId,
        parentArnProfileId,
      },
    });
  }

  /** Admin-initiated reset — bypasses the current-password check in AuthService.changePassword, which is for a logged-in distributor changing their own password, not for support recovering a forgotten one. */
  async resetPassword(distributorId: string, dto: ResetPasswordDto): Promise<void> {
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await prisma.distributor.update({ where: { id: distributorId }, data: { passwordHash } });
  }
}
