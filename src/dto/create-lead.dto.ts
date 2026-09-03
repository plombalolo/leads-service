import {
  IsString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  Min,
} from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  country!: string;

  @IsString()
  @IsNotEmpty()
  serviceType!: string;

  @IsNumber()
  @Min(0)
  budget!: number;

  @IsString()
  @IsOptional()
  comment?: string;
}
