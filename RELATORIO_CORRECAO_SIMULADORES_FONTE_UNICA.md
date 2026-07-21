# Relatório - Correção Fonte Única de Simuladores

## Objetivo
Garantir que o NVU utilize exclusivamente o Firebase como fonte oficial da coleção `/simulators`.

## Arquivo alterado
- src/context/AppContext.tsx

## Correções aplicadas
- Removido seed automático de simuladores pelo frontend.
- Removida lista fixa de simuladores como fallback de negócio.
- Mantida leitura exclusiva via Firestore.
- Em caso de erro de permissão, o sistema registra o erro no console e mantém estado seguro vazio.

## Fluxo final
Firebase `/simulators`
↓
AppContext
↓
Cadastro de Empresa
↓
Inscrição de Motorista

## Impacto isolado
Não foram alterados:
- Ranking
- Histórico de viagens
- Operações
- simulatorId
- Notificações

## Regra Firebase necessária
A coleção simulators deve permitir leitura pública (ou conforme política de acesso definida), mantendo escrita restrita a administradores.

Exemplo:
match /simulators/{simulatorId} {
  allow read: if true;
  allow write: if false;
}

## Validação recomendada
Criar um novo documento em `/simulators` no Firebase e confirmar que ele aparece automaticamente:
- Cadastro de empresa
- Inscrição motorista
