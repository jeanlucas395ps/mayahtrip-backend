import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class PublicacaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsIn(['public', 'private'])
  visibility!: 'public' | 'private';

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  placeIds!: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentionIds?: string[];
}

export class ComentarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;

  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}

export class DenunciaDto {
  @IsUUID('4')
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID('4')
  postId?: string;

  @IsOptional()
  @IsUUID('4')
  commentId?: string;

  @IsOptional()
  @IsUUID('4')
  reviewId?: string;

  @IsOptional()
  @IsUUID('4')
  reportedUserId?: string;
}
