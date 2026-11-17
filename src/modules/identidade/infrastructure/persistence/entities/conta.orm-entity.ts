import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { EstadoConta, OrigemConta } from '../../../domain/entities/conta.entity';

/**
 * Mapeamento de persistência — não é o aggregate de domínio. ADR
 * `0001-identidade-tokens-persistencia.md`: Postgres, migration manual,
 * nunca `synchronize`.
 */
@Entity({ name: 'conta' })
export class ContaOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  nome!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'hash_senha', type: 'varchar', length: 255, nullable: true })
  hashSenha!: string | null;

  @Column({ name: 'codigo_verificacao', type: 'varchar', length: 4, nullable: true })
  codigoVerificacao!: string | null;

  @Column({ name: 'codigo_gerado_em', type: 'timestamptz', nullable: true })
  codigoGeradoEm!: Date | null;

  @Column({ name: 'tentativas_codigo', type: 'int', default: 0 })
  tentativasCodigo!: number;

  @Column({ name: 'google_sub', type: 'varchar', length: 255, nullable: true })
  googleSub!: string | null;

  @Column({ type: 'varchar', length: 20 })
  estado!: EstadoConta;

  @Column({ type: 'varchar', length: 20, default: 'senha' })
  origem!: OrigemConta;

  @CreateDateColumn({ name: 'criada_em', type: 'timestamptz' })
  criadaEm!: Date;
}
