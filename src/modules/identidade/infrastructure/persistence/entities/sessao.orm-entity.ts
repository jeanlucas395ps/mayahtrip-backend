import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'sessao' })
export class SessaoOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'conta_id', type: 'uuid' })
  contaId!: string;

  @Index()
  @Column({ name: 'familia_id', type: 'uuid' })
  familiaId!: string;

  @Index({ unique: true })
  @Column({ name: 'hash_refresh', type: 'varchar', length: 64 })
  hashRefresh!: string;

  @Column({ name: 'access_jti', type: 'uuid' })
  accessJti!: string;

  @Column({ name: 'manter_conectado', type: 'boolean' })
  manterConectado!: boolean;

  @Column({ name: 'expira_em', type: 'timestamptz' })
  expiraEm!: Date;

  @Column({ name: 'consumida_em', type: 'timestamptz', nullable: true })
  consumidaEm!: Date | null;

  @Column({ type: 'boolean', default: false })
  revogada!: boolean;

  @CreateDateColumn({ name: 'criada_em', type: 'timestamptz' })
  criadaEm!: Date;
}
