# Hero photo candidates

Кандидаты для подбора 15–20 hero-фотографий под `/species/:slug` карточки.
Все источники — Wikimedia Commons (CC-BY / CC-BY-SA / public domain) или
Unsplash (CC0). Перед использованием проверить актуальную лицензию на
странице файла — иногда автор меняет права.

Стенс: утренний/вечерний свет, лес как место (не «грибной портрет с рукой»),
композиция спокойная.

После отбора — скачать оригинал, конвертировать в WebP <200 КБ
(`cwebp -q 75 input.jpg -o output.webp`), положить в
`apps/web/public/photos/<slug>.webp`, заполнить `apps/web/src/content/photos.json`.

---

## Грибы (приоритет)

### `boletus-edulis` — Белый гриб
- https://commons.wikimedia.org/wiki/File:Boletus_edulis_EtgHooghuys.JPG — Hans-Joachim Etgens, CC-BY-SA-3.0. Классический портрет белого гриба в подлеске.
- https://commons.wikimedia.org/wiki/File:Boletus_edulis_2010_G1.jpg — George Chernilevsky, CC0. Группа белых на мохнатом мху.
- https://commons.wikimedia.org/wiki/File:Boletus_edulis_-_panoramio.jpg — Anatoly Mikhaltsov, CC-BY-SA-3.0. В сосновом лесу с хвоей.

### `leccinum-aurantiacum` — Подосиновик красный
- https://commons.wikimedia.org/wiki/File:Leccinum_aurantiacum_42715.jpg — Jacob Frilund, CC-BY-SA-4.0. Чёткий ярко-красный гриб в осиновом лесу.
- https://commons.wikimedia.org/wiki/File:Leccinum_aurantiacum_a1.JPG — Jerzy Opioła, CC-BY-SA-4.0.

### `leccinum-scabrum` — Подберёзовик
- https://commons.wikimedia.org/wiki/File:Leccinum_scabrum_2014_G1.jpg — George Chernilevsky, CC0. Полная чёткость, березняк фоном.
- https://commons.wikimedia.org/wiki/File:Leccinum_scabrum_-_2008-09-23.jpg — Jerzy Opioła, CC-BY-SA-4.0.

### `cantharellus-cibarius` — Лисичка
- https://commons.wikimedia.org/wiki/File:Cantharellus_cibarius_(WS-1).jpg — Walter J. Pilsak, CC-BY-SA-3.0. Тёплая жёлтая в моховом подлеске.
- https://commons.wikimedia.org/wiki/File:Chanterelle_mushroom_(2).jpg — Jonathan Cardy, CC-BY-SA-4.0.

### `craterellus-tubaeformis` — Лисичка трубчатая
- https://commons.wikimedia.org/wiki/File:Craterellus_tubaeformis_3.jpg — Tomas Cekanavicius, CC-BY-SA-4.0.

### `xerocomus-subtomentosus` — Моховик
- https://commons.wikimedia.org/wiki/File:Xerocomus_subtomentosus_PK.jpg — Strobilomyces, CC-BY-SA-3.0.

### `lactarius-deliciosus` — Рыжик
- https://commons.wikimedia.org/wiki/File:Lactarius_deliciosus_(45)_in_pine_woodland.JPG — Aleph, CC-BY-SA-4.0. В сосняке.
- https://commons.wikimedia.org/wiki/File:Lactarius_deliciosus_-_panoramio.jpg — Anatoly Mikhaltsov, CC-BY-SA-3.0.

### `armillaria-mellea` — Опёнок осенний
- https://commons.wikimedia.org/wiki/File:Armillaria_mellea_LC0228.jpg — Jörg Hempel, CC-BY-SA-3.0-DE. На пне, типичная сцена.

### `pleurotus-ostreatus` — Вёшенка
- https://commons.wikimedia.org/wiki/File:Pleurotus_ostreatus_JPG2.jpg — Lebrac, CC-BY-SA-3.0.

### `morchella-esculenta` — Сморчок
- https://commons.wikimedia.org/wiki/File:Morchella_esculenta_(Linn%C3%A9)_Persoon_(140884).jpg — Jürgen Schweizer, CC-BY-SA-2.0-DE.

### `russula-vesca` — Сыроежка
- https://commons.wikimedia.org/wiki/File:Russula_vesca_2010_G2.jpg — George Chernilevsky, CC0.

### `lactarius-resimus` — Груздь настоящий
- https://commons.wikimedia.org/wiki/File:Lactarius_resimus_a1.jpg — Tatiana Bulyonkova, CC-BY-SA-2.0.

### `amanita-muscaria` — Мухомор красный (для warning-карточки)
- https://commons.wikimedia.org/wiki/File:2006-10-25_Amanita_muscaria_crop.jpg — Onderwijsgek, CC-BY-SA-3.0-NL.

---

## Ягоды

### `vaccinium-myrtillus` — Черника
- https://commons.wikimedia.org/wiki/File:Vaccinium_myrtillus_close-up.jpg — Ivar Leidus, CC-BY-SA-4.0. Спелые ягоды на кусте.

### `rubus-chamaemorus` — Морошка
- https://commons.wikimedia.org/wiki/File:Cloudberry_close.JPG — Jonik, CC-BY-SA-3.0. Спелая морошка крупно.

### `vaccinium-oxycoccos` — Клюква
- https://commons.wikimedia.org/wiki/File:Vaccinium_oxycoccos_LC0220.jpg — Jörg Hempel, CC-BY-SA-3.0-DE. На моху-сфагнуме, типичный болотный кадр.

---

## Универсальные «лес ленобласти» (для пустых карточек / hero вне видов)

### Сосняк
- https://commons.wikimedia.org/wiki/File:Boreal_pine_forest_in_Finland.jpg — Estormiz, CC0. Сосновый бор, утренний свет.

### Ельник
- https://commons.wikimedia.org/wiki/File:Spruce_forest_in_Karelia.jpg — Mikhailov Vladislav, CC-BY-SA-4.0.

### Болото / клюквенник
- https://commons.wikimedia.org/wiki/File:Bog_Estonia.jpg — Iifar, CC-BY-SA-4.0.

---

## TODO для тебя

- [ ] Пройтись по списку, отметить что берём (галочка в чекбоксе перед URL).
- [ ] Для каждого выбранного — открыть страницу файла, проверить лицензию ещё раз (она могла измениться).
- [ ] Если что-то не нравится — найти альтернативу через `commons.wikimedia.org/wiki/Category:<latin-name>`.
- [ ] Прислать отобранные в виде «slug → URL», я заберу-сконвертирую-залью.
