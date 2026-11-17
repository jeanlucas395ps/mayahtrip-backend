import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'codigo_handoff' })
export class CodigoHandoffOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'conta_id', type: 'uuid' })
  contaId!: string;

  @Index({ unique: true })
  @Column({ name: 'hash_codigo', type: 'varchar', length: 64 })
  hashCodigo!: string;

  @Column({ name: 'expira_em', type: 'timestamptz' })
  expiraEm!: Date;

  @Column({ name: 'usado_em', type: 'timestamptz', nullable: true })
  usadoEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
