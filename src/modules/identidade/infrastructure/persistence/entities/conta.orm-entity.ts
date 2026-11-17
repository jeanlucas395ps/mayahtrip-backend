import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { EstadoConta } from '../../../domain/entities/conta.entity';

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

  @Column({ name: 'hash_senha', type: 'varchar', length: 255 })
  hashSenha!: string;

  @Column({ name: 'codigo_verificacao', type: 'varchar', length: 4 })
  codigoVerificacao!: string;

  @Column({ name: 'codigo_gerado_em', type: 'timestamptz' })
  codigoGeradoEm!: Date;

  @Column({ type: 'varchar', length: 20 })
  estado!: EstadoConta;

  @CreateDateColumn({ name: 'criada_em', type: 'timestamptz' })
  criadaEm!: Date;
}
