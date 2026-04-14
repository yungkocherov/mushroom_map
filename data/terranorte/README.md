# data/terranorte/

Сюда кладутся GeoTIFF'ы TerraNorte RLC (Russia Land Cover, ИКИ РАН).

Как получить — см. [../../docs/terranorte_download.md](../../docs/terranorte_download.md).

```
*.tif            ← растры классификации
class_map.yaml   ← опционально: твой маппинг кодов классов на slug'и
                   (нужен только если легенда отличается от best-guess в terranorte.py)
```

Файлы в этой папке в git не коммитятся (см. .gitignore).
