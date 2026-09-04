-- Pesquisa periódica da base de conhecimento (pedido do diretor): em vez de
-- pesquisar na internet a cada laudo (caro e imprevisível), a plataforma
-- roda uma pesquisa aprofundada de tempos em tempos (o curador decide
-- quando, com um botão) e guarda o que encontrou em `technical_sources`
-- (já existente, migration 013) -- sempre como DRAFT, sempre dependente de
-- homologação humana antes de poder ser citada por qualquer geração real.
-- Cada laudo do dia a dia passa a se basear nesse conteúdo já pesquisado e
-- homologado, em vez de pesquisar de novo.
ALTER TYPE ai_generation_kind ADD VALUE IF NOT EXISTS 'KNOWLEDGE_RESEARCH';
