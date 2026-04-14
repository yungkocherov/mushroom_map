# data/rosleshoz/

Сюда кладутся векторные файлы с таксационными выделами из Rosleshoz /
ФГИС ЛК / регионального кадастра.

Как получить — см. [../../docs/rosleshoz_download.md](../../docs/rosleshoz_download.md).

Поддерживаемые форматы (через pyogrio/GDAL):
- GeoJSON (`.geojson`, `.json`)
- ESRI Shapefile (`.shp` + `.dbf` + `.shx` + `.prj`)
- GeoPackage (`.gpkg`)
- FlatGeobuf (`.fgb`)
- OpenFileGDB (директория `.gdb`)

У каждого выдела должен быть атрибут с формулой породного состава
типа `6Е3С1Б`. Имя поля автоматически определяется из стандартного
списка (`formula`, `species_comp`, `породный_состав` и др.), иначе
можно указать явно через `--rosleshoz-formula-field`.

Файлы в этой папке в git не коммитятся (см. .gitignore).
