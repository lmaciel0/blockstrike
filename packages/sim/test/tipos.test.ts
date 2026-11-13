import { describe, expectTypeOf, it } from 'vitest';
import type {
  Arma, Bomba, Caixa, Cerebro, Comandos, Entidade, Equip, Evento, Mundo, Partida, Rng, Vec3,
} from '../src/tipos.js';

// Teste de tipos: só vale com `--typecheck` (em tempo de execução o `expectTypeOf` não faz nada).
describe('tipos do domínio', () => {
  it('Evento é união discriminada por `tipo` literal em todos os membros', () => {
    // Algum membro com `tipo: string` alargaria a união inteira para `string`.
    expectTypeOf<string>().not.toEqualTypeOf<Evento['tipo']>();
    expectTypeOf<Evento['tipo']>().toEqualTypeOf<
      | 'pulo' | 'pouso' | 'passo' | 'acerto' | 'morte' | 'impacto' | 'raio' | 'golpe' | 'saque' | 'recarga' | 'tiro'
      | 'bomba-solta' | 'bomba-pega' | 'acao-cancelada' | 'acao-inicio' | 'plantada' | 'desarmada' | 'explosao'
      | 'arremesso' | 'granada-quique' | 'fogo-apagado' | 'molotov-ar' | 'fogo' | 'fogo-fim' | 'fumaca' | 'flash'
      | 'cegueira' | 'explosao-he' | 'fumaca-fim'
    >();
  });

  it('o `tipo` estreita o evento para os campos reais', () => {
    type Morte = Extract<Evento, { tipo: 'morte' }>;
    expectTypeOf<Morte['vitima']>().toEqualTypeOf<number>();
    expectTypeOf<Morte['assassino']>().toEqualTypeOf<number | null>();
    expectTypeOf<Morte['cabeca']>().toEqualTypeOf<boolean>();
    // A morte pela C4 (bomba.ts) não tem o campo `assistente`; a do tiro (mundo.ts) tem, com id ou null.
    expectTypeOf<Morte>().toHaveProperty('assistente');
    expectTypeOf<Extract<Evento, { tipo: 'acerto' }>['ponto']>().toEqualTypeOf<Vec3>();
    expectTypeOf<Extract<Evento, { tipo: 'passo' }>>().toEqualTypeOf<{ tipo: 'passo'; id: number }>();
    expectTypeOf<Extract<Evento, { tipo: 'plantada' }>['site']>().toEqualTypeOf<'A' | 'B' | null>();
  });

  it('Entidade tem id, time, vivo e pos: Vec3', () => {
    expectTypeOf<Entidade['id']>().toEqualTypeOf<number>();
    expectTypeOf<Entidade['time']>().toEqualTypeOf<'azul' | 'laranja'>();
    expectTypeOf<Entidade['vivo']>().toEqualTypeOf<boolean>();
    expectTypeOf<Entidade['pos']>().toEqualTypeOf<Vec3>();
    expectTypeOf<Vec3>().toEqualTypeOf<{ x: number; y: number; z: number }>();
  });

  it('Entidade: campos que só existem com economia, cérebro ou granada são opcionais', () => {
    expectTypeOf<Entidade['equip']>().toEqualTypeOf<Equip | undefined>();
    expectTypeOf<Entidade['dinheiro']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Entidade['cerebro']>().toEqualTypeOf<Cerebro | undefined>();
    expectTypeOf<NonNullable<Entidade['armas']>['pistola']>().toEqualTypeOf<Arma>();
  });

  it('Mundo: entidades, rng, bomba e modo', () => {
    expectTypeOf<Mundo['entidades']>().toEqualTypeOf<Entidade[]>();
    expectTypeOf<Mundo['rng']>().toEqualTypeOf<Rng>();
    expectTypeOf<Rng>().toEqualTypeOf<() => number>();
    expectTypeOf<Mundo['bomba']>().toEqualTypeOf<Bomba | null>();
    expectTypeOf<Mundo['modo']>().toEqualTypeOf<'partida' | 'treino'>();
    expectTypeOf<Mundo['economia']>().toEqualTypeOf<boolean | undefined>();
  });

  it('Caixa, Comandos e Partida têm as formas que o código monta', () => {
    expectTypeOf<Caixa>().toEqualTypeOf<{ min: Vec3; max: Vec3; cor: number | string }>();
    expectTypeOf<Comandos['yaw']>().toEqualTypeOf<number>();
    expectTypeOf<Comandos['granada']>().toEqualTypeOf<'he' | 'molotov' | 'flash' | 'smoke' | null>();
    expectTypeOf<Comandos['granadaAlvo']>().toEqualTypeOf<Vec3 | undefined>();
    expectTypeOf<Partida['fase']>().toEqualTypeOf<'freeze' | 'jogo' | 'fim-round' | 'fim-partida'>();
    expectTypeOf<Partida['placar']>().toEqualTypeOf<{ azul: number; laranja: number }>();
    expectTypeOf<Bomba['terroristas']>().toEqualTypeOf<'azul' | 'laranja'>();
  });
});
