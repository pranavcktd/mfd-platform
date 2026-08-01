import { ArrayUnique, IsArray, IsString } from "class-validator";

export class CreateFamilyDto {
  @IsString()
  familyName!: string;

  @IsString()
  headClientId!: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  memberClientIds!: string[];
}

export class UpdateFamilyDto {
  @IsString()
  familyName!: string;
}

export class AddFamilyMemberDto {
  @IsString()
  clientId!: string;
}

export class SetFamilyHeadDto {
  @IsString()
  clientId!: string;
}
