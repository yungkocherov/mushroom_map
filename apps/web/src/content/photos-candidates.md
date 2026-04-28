# Hero photo candidates — guide for selection

> ⚠️ **Дисклеймер.** Прошлая версия этого файла содержала прямые ссылки
> на файлы Wikimedia Commons, часть из которых я придумал и они не
> существуют. Эта версия даёт ссылки только на **категории** Commons —
> это страницы-каталоги, существуют гарантированно и автоматически
> подгружают актуальный набор файлов с лицензиями.

## Как пользоваться

1. Открой нужную категорию ниже.
2. Прокрути миниатюры, пометь визуально подходящие (утренний/вечерний свет,
   спокойная композиция, лес как место — не «гриб в руке»).
3. Кликни в миниатюру → откроется страница файла. **Проверь лицензию**
   в секции «Licensing» внизу: подходят CC0, CC-BY, CC-BY-SA. Не годятся
   `Fair use`, `Non-commercial`, `No derivatives`.
4. На странице файла найди ссылку «Original file» (или клик в превью —
   откроется в полном разрешении). Скачай.
5. Конвертируй: `cwebp -q 75 input.jpg -o boletus-edulis.webp` (целевой
   размер <200 КБ).
6. Положи в `apps/web/public/photos/<slug>.webp`.
7. Заполни запись в `apps/web/src/content/photos.json`:
   ```json
   { "slug": "...", "src": "/photos/<slug>.webp",
     "author": "Имя автора (с страницы файла)",
     "license": "CC-BY-SA-4.0",
     "alt_ru": "Описание для скрин-ридера" }
   ```

## Стенс

Не «портрет гриба крупным планом в руке». Скорее: гриб в естественном
окружении, мягкий боковой свет, видно подстилку/мох/подлесок. После
обработки в коде применяется `filter: saturate(0.9) brightness(0.95)` +
градиент-вуаль, так что исходник не должен быть слишком тёмным или
контрастным.

---

## Категории Wikimedia Commons по slug'ам

### Грибы (приоритет)

| slug | Категория |
|---|---|
| `boletus-edulis` (Белый) | https://commons.wikimedia.org/wiki/Category:Boletus_edulis |
| `leccinum-aurantiacum` (Подосиновик красный) | https://commons.wikimedia.org/wiki/Category:Leccinum_aurantiacum |
| `leccinum-versipelle` (Подосиновик жёлто-бурый) | https://commons.wikimedia.org/wiki/Category:Leccinum_versipelle |
| `leccinum-scabrum` (Подберёзовик) | https://commons.wikimedia.org/wiki/Category:Leccinum_scabrum |
| `cantharellus-cibarius` (Лисичка) | https://commons.wikimedia.org/wiki/Category:Cantharellus_cibarius |
| `craterellus-tubaeformis` (Лисичка трубчатая) | https://commons.wikimedia.org/wiki/Category:Craterellus_tubaeformis |
| `xerocomus-subtomentosus` (Моховик) | https://commons.wikimedia.org/wiki/Category:Xerocomus_subtomentosus |
| `lactarius-deliciosus` (Рыжик) | https://commons.wikimedia.org/wiki/Category:Lactarius_deliciosus |
| `lactarius-resimus` (Груздь настоящий) | https://commons.wikimedia.org/wiki/Category:Lactarius_resimus |
| `lactarius-torminosus` (Волнушка) | https://commons.wikimedia.org/wiki/Category:Lactarius_torminosus |
| `armillaria-mellea` (Опёнок осенний) | https://commons.wikimedia.org/wiki/Category:Armillaria_mellea |
| `kuehneromyces-mutabilis` (Опёнок летний) | https://commons.wikimedia.org/wiki/Category:Kuehneromyces_mutabilis |
| `pleurotus-ostreatus` (Вёшенка) | https://commons.wikimedia.org/wiki/Category:Pleurotus_ostreatus |
| `morchella-esculenta` (Сморчок) | https://commons.wikimedia.org/wiki/Category:Morchella_esculenta |
| `verpa-bohemica` (Верпа) | https://commons.wikimedia.org/wiki/Category:Verpa_bohemica |
| `gyromitra-esculenta` (Строчок) | https://commons.wikimedia.org/wiki/Category:Gyromitra_esculenta |
| `russula-vesca` (Сыроежка пищевая) | https://commons.wikimedia.org/wiki/Category:Russula_vesca |
| `amanita-muscaria` (Мухомор красный) | https://commons.wikimedia.org/wiki/Category:Amanita_muscaria |

### Ягоды

| slug | Категория |
|---|---|
| `vaccinium-myrtillus` (Черника) | https://commons.wikimedia.org/wiki/Category:Vaccinium_myrtillus |
| `rubus-chamaemorus` (Морошка) | https://commons.wikimedia.org/wiki/Category:Rubus_chamaemorus |
| `vaccinium-oxycoccos` (Клюква) | https://commons.wikimedia.org/wiki/Category:Vaccinium_oxycoccos |

### Фоновые «лес» — для будущих универсальных hero (не привязаны к slug'у)

- Сосновый бор: https://commons.wikimedia.org/wiki/Category:Pine_forests
- Ельник: https://commons.wikimedia.org/wiki/Category:Spruce_forests
- Болото / клюквенник: https://commons.wikimedia.org/wiki/Category:Sphagnum_bogs
- Берёзовая роща: https://commons.wikimedia.org/wiki/Category:Birch_forests

---

## Что прислать обратно

Когда выберешь — пришли в виде:

```
boletus-edulis  → https://commons.wikimedia.org/wiki/File:Точное_имя_файла.jpg
leccinum-aurantiacum → ...
```

Я заберу-сконвертирую-залью, заполню `photos.json` с реальной атрибуцией.
