import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsEmail, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";

export class CreateArnProfileDto {
  @IsString()
  arnNumber!: string;

  @IsString()
  arnHolderName!: string;

  @IsOptional()
  @IsString()
  euinNumber?: string;

  // PAN/displayName/email/phone are marked "*" on the onboarding form, but
  // per the actual business requirement that means NOT mandatory (opposite
  // of the usual asterisk convention) — child ARN onboarding routinely
  // omits all four.
  @IsOptional()
  @IsString()
  panNumber?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsEmail()
  camsMailId?: string;

  @IsOptional()
  @IsString()
  gstNumber?: string;
}

/**
 * The parent (top-level) ARN's camsMailId doubles as the distributor's
 * login email — required here, unlike the base DTO, since onboarding no
 * longer takes a separate email/password. Child ARNs (see
 * CreateDistributorDto.childArnProfiles) keep camsMailId optional — they
 * merge into the parent's dashboard, not a separate login.
 */
export class CreateParentArnProfileDto extends CreateArnProfileDto {
  @IsEmail()
  declare camsMailId: string;
}

export class CreateDistributorDto {
  @IsString()
  name!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CreateParentArnProfileDto)
  arnProfile!: CreateParentArnProfileDto;

  /** Optional child ARNs to create in the same onboarding call — the "does this client want a child ARN too" step. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateArnProfileDto)
  childArnProfiles?: CreateArnProfileDto[];

  // RTA credentials captured at onboarding time so the mail-sync pipeline
  // can decrypt this MFD's archives immediately, without a separate
  // post-onboarding "save credential" step. Stored encrypted as
  // ExternalCredential rows against the parent ArnProfile (see
  // AdminService.createDistributor) — never returned in any API response.

  /** KFintech DSS portal login id — also the id used when setting up scheduled RTA report delivery. */
  @IsOptional()
  @IsString()
  kfintechDssLoginId?: string;

  /** KFintech DSS portal password — doubles as the password used when scheduling RTA file delivery. Not the zip password (see kfintechZipPassword). */
  @IsOptional()
  @IsString()
  kfintechDssPassword?: string;

  /** Password to open/decrypt the KFintech RTA mailback zip attachments. */
  @IsOptional()
  @IsString()
  kfintechZipPassword?: string;

  /** Password to open/decrypt the CAMS RTA mailback zip attachments. */
  @IsOptional()
  @IsString()
  camsZipPassword?: string;
}
