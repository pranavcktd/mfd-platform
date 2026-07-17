import { IsOptional, IsUUID } from "class-validator";
import { CreateArnProfileDto } from "./create-distributor.dto";

export class CreateChildArnProfileDto extends CreateArnProfileDto {
  @IsOptional()
  @IsUUID()
  parentArnProfileId?: string;
}
