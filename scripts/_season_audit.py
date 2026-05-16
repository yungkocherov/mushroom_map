"""Read-only feasibility audit for the Сезонность tab. Not a pipeline.

Run: PYTHONIOENCODING=utf-8 <venv>/python.exe scripts/_season_audit.py
"""
import psycopg

DSN = "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
c = psycopg.connect(DSN)
q = c.execute

tot = q("SELECT count(*) FROM vk_post").fetchone()[0]
cls = q(
    "SELECT count(*) FROM vk_post WHERE photo_species IS NOT NULL "
    "AND jsonb_array_length(photo_species) > 0"
).fetchone()[0]
foray = q(
    "SELECT round(100.0*count(*) FILTER (WHERE foray_date IS NOT NULL)"
    "/NULLIF(count(*),0),1) FROM vk_post WHERE photo_species IS NOT NULL"
).fetchone()[0]
span = q(
    "SELECT min(d),max(d) FROM (SELECT COALESCE(foray_date,"
    "(date_ts AT TIME ZONE 'Europe/Moscow')::date) d FROM vk_post "
    "WHERE photo_species IS NOT NULL) t WHERE d IS NOT NULL"
).fetchone()
per_year = q(
    "SELECT EXTRACT(YEAR FROM COALESCE(foray_date,"
    "(date_ts AT TIME ZONE 'Europe/Moscow')::date))::int y,count(*) n "
    "FROM vk_post WHERE photo_species IS NOT NULL AND COALESCE(foray_date,"
    "(date_ts AT TIME ZONE 'Europe/Moscow')::date) IS NOT NULL "
    "GROUP BY 1 ORDER BY 1"
).fetchall()
sp = q(
    """
    WITH e AS (
      SELECT (s->>'species')::text sk,
        EXTRACT(YEAR FROM COALESCE(foray_date,
          (date_ts AT TIME ZONE 'Europe/Moscow')::date))::int y, v.id pid
      FROM vk_post v, LATERAL jsonb_array_elements(v.photo_species) s
      WHERE v.photo_species IS NOT NULL AND s->>'species' IS NOT NULL
        AND s->>'species' <> 'other' AND COALESCE(foray_date,
          (date_ts AT TIME ZONE 'Europe/Moscow')::date) IS NOT NULL),
    py AS (SELECT sk,y,count(DISTINCT pid) n FROM e GROUP BY sk,y)
    SELECT sk, sum(n)::int posts, count(*) yrs,
      count(*) FILTER (WHERE n>=20) yrs20,
      count(*) FILTER (WHERE n>=50) yrs50
    FROM py GROUP BY sk ORDER BY posts DESC
    """
).fetchall()

print("total", tot, "classified", cls, "foray_pct", foray)
print("span", str(span[0]), "->", str(span[1]))
print("per_year", [(y, n) for y, n in per_year])
print("species sk/posts/yrs/yrs>=20/yrs>=50")
for r in sp:
    print(" ", *r)
