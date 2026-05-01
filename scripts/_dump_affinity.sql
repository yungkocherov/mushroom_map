WITH agg AS (
  SELECT
    s.slug AS species,
    jsonb_agg(
      jsonb_build_object('tree', a.forest_type, 'affinity', round(a.affinity::numeric, 3))
      ORDER BY a.affinity DESC
    ) AS pairs
  FROM species_forest_affinity a
  JOIN species s ON s.id = a.species_id
  WHERE a.affinity > 0
  GROUP BY s.slug
)
SELECT jsonb_build_object(
  'schema_version', 1,
  'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'species', jsonb_object_agg(species, pairs)
)::text FROM agg;
