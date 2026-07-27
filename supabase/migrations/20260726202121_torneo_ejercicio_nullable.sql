-- ============================================================================
-- CAMPA · torneo.ejercicio_id pasa a nullable
-- Un ejercicio contiene VARIOS torneos (no es uno-a-uno), y por ahora el
-- ejercicio queda sin usar. La FK a ejercicio se conserva; solo se relaja
-- la obligatoriedad. Tablas vacías: cambio seguro.
-- ============================================================================

alter table torneo alter column ejercicio_id drop not null;
