import { IsOptional, IsString, IsIn } from 'class-validator';

export class FindLeadsDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsIn(['budget', 'createdAt']) sortBy?: 'budget' | 'createdAt';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}
