import { IsIn } from 'class-validator';

export class VisibilidadeAdminDto {
  @IsIn(['private', 'public'])
  visibility!: 'private' | 'public';
}
