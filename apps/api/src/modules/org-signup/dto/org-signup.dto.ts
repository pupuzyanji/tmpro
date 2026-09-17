import { ArrayMaxSize, IsArray, IsEmail, IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateOrgSignupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  organisationName!: string;

  @IsString()
  @MinLength(1)
  country!: string;

  @IsInt()
  @Min(1)
  staffComplement!: number;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  featuresNeeded!: string[];
}
