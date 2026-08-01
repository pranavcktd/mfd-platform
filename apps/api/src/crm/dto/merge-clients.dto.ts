import { IsString } from "class-validator";

export class MergeClientsDto {
  @IsString()
  sourceClientId!: string;

  @IsString()
  targetClientId!: string;
}
