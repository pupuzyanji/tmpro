import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsString()
  @MinLength(1)
  courseUrl!: string;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  courseUrl?: string;
}

export class QuizOptionDto {
  @IsString()
  @MinLength(1)
  optionText!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class QuizQuestionDto {
  @IsString()
  @MinLength(1)
  question!: string;

  @ValidateNested({ each: true })
  @Type(() => QuizOptionDto)
  @ArrayMinSize(2)
  options!: QuizOptionDto[];
}

/** A full replace of a course's quiz — simpler to author (and re-order) than
 *  incremental question/option patches, matching how the Leave Types table
 *  is edited as one bulk Save rather than per-cell. */
export class SetQuizDto {
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  @IsArray()
  questions!: QuizQuestionDto[];
}

export class AssignCourseDto {
  @IsUUID()
  courseId!: string;

  @IsUUID(undefined, { each: true })
  @ArrayMinSize(1)
  employeeIds!: string[];
}

export class QuizAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsUUID()
  optionId!: string;
}

export class SubmitQuizDto {
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  @IsArray()
  answers!: QuizAnswerDto[];
}
